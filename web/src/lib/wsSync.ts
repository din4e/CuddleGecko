// Real-time multi-device todo sync over WebSocket.
//
// Opens one connection scoped to a workspace; on inbound "todo.changed" frames
// the caller invalidates its todo queries so TanStack Query refetches the fresh
// state. Reconnects with capped exponential backoff + jitter, re-reading the
// access token via getToken() on every attempt so a refreshed token is picked
// up automatically; an expiring token is rotated via refreshToken before the
// handshake (a WS upgrade can't ride the HTTP 401 refresh-retry path).

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

export interface TodoChangedMessage {
  workspaceId: number
  todoId: number
  kind: string
}

export interface TodoWsSyncOptions {
  /** Returns the current access token (re-read on every reconnect). */
  getToken: () => string | null
  /**
   * Rotates the access token over HTTP. Called before (re)connecting when the
   * current token is expiring: the WS handshake can't go through the 401
   * refresh-and-retry path, so without this an idle session's reconnects
   * would loop forever on an expired token.
   */
  refreshToken?: () => Promise<string>
  /** Workspace to scope the connection to (captured from the URL at connect time). */
  workspaceId: number | null
  /** Called for each inbound todo.changed frame. */
  onTodoChanged: (msg: TodoChangedMessage) => void
}

export interface TodoWsSyncController {
  stop: () => void
}

// startTodoWsSync opens the socket immediately and keeps it alive (reconnecting
// on close) until the returned controller.stop() is called.
export function startTodoWsSync(opts: TodoWsSyncOptions): TodoWsSyncController {
  let stopped = false
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  const buildUrl = () => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams()
    const token = opts.getToken()
    if (token) params.set('token', token)
    if (opts.workspaceId != null) params.set('workspace_id', String(opts.workspaceId))
    return `${proto}//${window.location.host}/api/ws?${params.toString()}`
  }

  const scheduleReconnect = () => {
    if (stopped) return
    attempt += 1
    const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1))
    const delay = exp + Math.random() * 500 // jitter to avoid reconnect storms
    reconnectTimer = setTimeout(connect, delay)
  }

  const connect = async () => {
    if (stopped) return
    let token = opts.getToken()
    if (!token) {
      // No token (logged out / not yet authed). Stop; the caller restarts on login.
      stopped = true
      return
    }
    if (opts.refreshToken && tokenExpiresWithin(token, 60_000)) {
      try {
        token = await opts.refreshToken()
      } catch {
        // Refresh failed (e.g. another tab holds the rotation); the backoff
        // loop will retry — getToken() re-reads whatever is freshest.
      }
      if (stopped) return
    }
    socket = new WebSocket(buildUrl())
    socket.onopen = () => {
      attempt = 0
    }
    socket.onmessage = (ev) => {
      const msg = parseTodoChanged(ev.data)
      if (msg) opts.onTodoChanged(msg)
    }
    socket.onclose = () => {
      socket = null
      scheduleReconnect()
    }
    socket.onerror = () => {
      // The browser always fires onclose after onerror; reconnect handled there.
    }
  }

  connect()

  return {
    stop: () => {
      stopped = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (socket) {
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        try {
          socket.close()
        } catch {
          // ignore — socket may already be closing
        }
        socket = null
      }
    },
  }
}

// tokenExpiresWithin decodes the JWT payload (base64url, no signature check —
// the server validates on handshake) and reports whether `exp` is less than
// `withinMs` away or already past.
function tokenExpiresWithin(token: string, withinMs: number): boolean {
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(b64)) as { exp?: unknown }
    if (typeof decoded.exp !== 'number') return false
    return decoded.exp * 1000 - Date.now() < withinMs
  } catch {
    return false
  }
}

function parseTodoChanged(raw: unknown): TodoChangedMessage | null {
  if (typeof raw !== 'string') return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null // keepalive / non-JSON frame
  }
  if (!parsed || parsed.type !== 'todo.changed') return null
  return {
    workspaceId: Number(parsed.workspace_id),
    todoId: Number(parsed.todo_id ?? 0),
    kind: String(parsed.kind ?? ''),
  }
}
