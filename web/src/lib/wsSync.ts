// Real-time multi-device todo sync over WebSocket.
//
// Opens one connection scoped to a workspace; on inbound "todo.changed" frames
// the caller invalidates its todo queries so TanStack Query refetches the fresh
// state. Reconnects with capped exponential backoff + jitter, re-reading the
// access token via getToken() on every attempt so a refreshed token is picked
// up automatically.

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

  const connect = () => {
    if (stopped) return
    const token = opts.getToken()
    if (!token) {
      // No token (logged out / not yet authed). Stop; the caller restarts on login.
      stopped = true
      return
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
