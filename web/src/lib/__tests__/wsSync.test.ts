import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startTodoWsSync } from '../wsSync'

// Minimal WebSocket double: records the URL, lets tests fire lifecycle events.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  url: string
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  closed = false
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  close() {
    this.closed = true
  }
  fireOpen() {
    this.onopen?.({})
  }
  fireMessage(data: unknown) {
    this.onmessage?.({ data })
  }
  fireClose() {
    this.onclose?.({})
  }
  static reset() {
    FakeWebSocket.instances = []
  }
}

describe('startTodoWsSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0) // deterministic jitter (0ms)
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('connects with token + workspace_id in the URL', () => {
    startTodoWsSync({ getToken: () => 'abc', workspaceId: 3, onDataChanged: () => {} })
    expect(FakeWebSocket.instances).toHaveLength(1)
    const url = FakeWebSocket.instances[0].url
    expect(url).toMatch(/^ws:\/\//)
    expect(url).toContain('token=abc')
    expect(url).toContain('workspace_id=3')
  })

  it('parses todo.changed frames and calls onDataChanged', () => {
    const onDataChanged = vi.fn()
    startTodoWsSync({ getToken: () => 'abc', workspaceId: 1, onDataChanged })
    FakeWebSocket.instances[0].fireMessage(
      JSON.stringify({ type: 'data.changed', workspace_id: 1, resource: 'todos', kind: 'updated', id: 42, entity: { id: 42, title: 'x' } }),
    )
    expect(onDataChanged).toHaveBeenCalledWith({
      workspaceId: 1,
      resource: 'todos',
      kind: 'updated',
      id: 42,
      entity: { id: 42, title: 'x' },
    })
  })

  it('ignores other frame types and malformed frames', () => {
    const onDataChanged = vi.fn()
    startTodoWsSync({ getToken: () => 'abc', workspaceId: 1, onDataChanged })
    const ws = FakeWebSocket.instances[0]
    ws.fireMessage('hello')
    ws.fireMessage(JSON.stringify({ type: 'ping' }))
    ws.fireMessage('{not json')
    expect(onDataChanged).not.toHaveBeenCalled()
  })

  it('reconnects with backoff after close', () => {
    const ctrl = startTodoWsSync({ getToken: () => 'abc', workspaceId: 1, onDataChanged: () => {} })
    expect(FakeWebSocket.instances).toHaveLength(1)
    FakeWebSocket.instances[0].fireClose()
    // attempt 1 backoff = 1000ms (+ 0 jitter)
    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    ctrl.stop()
  })

  it('stop() closes the socket and prevents further reconnection', () => {
    const ctrl = startTodoWsSync({ getToken: () => 'abc', workspaceId: 1, onDataChanged: () => {} })
    const first = FakeWebSocket.instances[0]
    ctrl.stop()
    expect(first.closed).toBe(true)
    // Simulate the close firing after stop; onclose was cleared so no reconnect.
    first.fireClose()
    vi.advanceTimersByTime(60000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('does not connect when there is no token', () => {
    startTodoWsSync({ getToken: () => null, workspaceId: 1, onDataChanged: () => {} })
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('resets backoff after a successful connection', () => {
    startTodoWsSync({ getToken: () => 'abc', workspaceId: 1, onDataChanged: () => {} })
    const ws = FakeWebSocket.instances[0]
    ws.fireOpen() // resets attempt counter
    ws.fireClose()
    vi.advanceTimersByTime(1000) // post-open close → first backoff is 1000ms again
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
})
