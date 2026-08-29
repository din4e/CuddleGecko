import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

// Node's global localStorage is undefined without --localstorage-file and
// shadows jsdom's — stub it like KanbanBoard.test does. The stub must exist
// BEFORE client.ts is imported: the module reads localStorage at load time,
// so the import is dynamic (static imports would hoist above the stub).
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => void store.set(key, value)),
  removeItem: vi.fn((key: string) => void store.delete(key)),
  clear: vi.fn(() => store.clear()),
})

const { default: client } = await import('../client')

// Single-flight refresh: when several queries 401 together (typical when a
// stale access token is loaded from localStorage at boot), they must share ONE
// /auth/refresh call — a refresh per failure replays the same rotated cookie
// and logs the user out.

const originalAdapter = client.defaults.adapter

function ok(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

describe('client token refresh', () => {
  let refreshCalls = 0

  beforeEach(() => {
    store.clear()
    store.set('access_token', 'stale-token')
    refreshCalls = 0
    client.defaults.adapter = vi.fn(async (config) => {
      const url = config.url || ''
      if (url === '/auth/refresh') {
        refreshCalls += 1
        return ok(config, { code: 0, data: { access_token: 'new-token', refresh_token: 'rotated' }, message: 'ok' })
      }
      if (refreshCalls > 0) {
        return ok(config, { code: 0, data: { ok: true }, message: 'ok' })
      }
      return Promise.reject({
        config,
        isAxiosError: true,
        response: { status: 401, data: null, headers: {} },
      })
    }) as unknown as AxiosAdapter
  })

  afterEach(() => {
    client.defaults.adapter = originalAdapter
  })

  it('concurrent 401s share a single /auth/refresh call and both retry', async () => {
    const [a, b] = await Promise.all([client.get('/contacts'), client.get('/todos')])

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(refreshCalls).toBe(1)
    expect(store.get('access_token')).toBe('new-token')
  })

  it('refreshes and retries a single 401 request', async () => {
    const res = await client.get('/contacts')
    expect(res.status).toBe(200)
    expect(refreshCalls).toBe(1)
    expect(store.get('access_token')).toBe('new-token')
  })

  it('does not attempt a refresh for auth endpoints', async () => {
    await expect(client.post('/auth/login', { username: 'x', password: 'y' })).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(refreshCalls).toBe(0)
    // A failed login must not clear the session state either.
    expect(store.get('access_token')).toBe('stale-token')
  })
})
