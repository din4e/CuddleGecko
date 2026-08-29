import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type { AuthResponse, ApiResponse } from '@/types'

let cachedToken = localStorage.getItem('access_token')
let cachedWorkspaceId = localStorage.getItem('current_workspace_id')

export function setCachedToken(token: string | null) {
  cachedToken = token
}

export function setCachedWorkspaceId(id: string | null) {
  cachedWorkspaceId = id
}

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export function setBaseURL(url: string) {
  client.defaults.baseURL = url + '/api'
}

client.interceptors.request.use((config) => {
  // Refresh requests carry the refresh token in the body; skip the stale access token.
  if (config.url !== '/auth/refresh') {
    if (cachedToken) {
      config.headers.Authorization = `Bearer ${cachedToken}`
    }
  }
  if (cachedWorkspaceId) {
    config.headers['X-Workspace-ID'] = cachedWorkspaceId
  }
  return config
})

async function unwrap<T>(response: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const res = await response
  return res.data.data
}

const inFlight = new Map<string, Promise<unknown>>()

function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) {
    return existing as Promise<T>
  }
  const promise = factory().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

function requestKey(method: string, url: string, config?: AxiosRequestConfig): string {
  return `${method}:${url}:${JSON.stringify(config?.params)}:${JSON.stringify(config?.data)}`
}

export const request = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    dedupe(requestKey('GET', url, config), () => unwrap(client.get<ApiResponse<T>>(url, config))),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    dedupe(requestKey('POST', url, { ...config, data }), () => unwrap(client.post<ApiResponse<T>>(url, data, config))),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    dedupe(requestKey('PUT', url, { ...config, data }), () => unwrap(client.put<ApiResponse<T>>(url, data, config))),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    dedupe(requestKey('PATCH', url, { ...config, data }), () => unwrap(client.patch<ApiResponse<T>>(url, data, config))),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    dedupe(requestKey('DELETE', url, config), () => unwrap(client.delete<ApiResponse<T>>(url, config))),
}

// Single-flight token refresh: when the access token expires, several queries
// can 401 at once; firing one /auth/refresh per failure replays the SAME
// (rotated) cookie and the losers read as token-replay → forced logout. All
// 401s in this tab await the same in-flight refresh instead.
let refreshInFlight: Promise<string> | null = null

// Shared by the 401 interceptor and the WebSocket reconnect path (see
// wsSync.ts) so a session that goes idle keeps its socket alive too.
export async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      // The refresh token lives in an HttpOnly cookie scoped to /api/auth;
      // no body needed. (Same-origin requests carry the cookie along.)
      const { data } = await client.post<ApiResponse<AuthResponse>>('/auth/refresh', {})
      const token = data.data.access_token
      localStorage.setItem('access_token', token)
      cachedToken = token
      return token
    })().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }
    const url = originalRequest?.url || ''
    // Auth endpoints manage tokens themselves; a 401 there (bad login) must
    // reach the caller instead of triggering a refresh loop.
    if (error.response?.status === 401 && !url.startsWith('/auth/') && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const token = await refreshAccessToken()
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${token}`,
        }
        return client(originalRequest)
      } catch {
        // One recovery pass: a concurrent tab may have just won the rotation
        // race (our cookie replay read as stale) — its fresh localStorage
        // token beats a redirect to /login.
        const latest = localStorage.getItem('access_token')
        if (latest && latest !== cachedToken) {
          cachedToken = latest
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${latest}`,
          }
          return client(originalRequest)
        }
        localStorage.removeItem('access_token')
        cachedToken = null
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default client
