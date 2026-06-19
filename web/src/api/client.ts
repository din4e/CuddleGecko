import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type { AuthResponse, ApiResponse } from '@/types'

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
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  const workspaceId = localStorage.getItem('current_workspace_id')
  if (workspaceId) {
    config.headers['X-Workspace-ID'] = workspaceId
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

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const { data: refreshData } = await client.post<ApiResponse<AuthResponse>>('/auth/refresh', {
            refresh_token: refreshToken,
          })
          const tokens = refreshData.data
          localStorage.setItem('access_token', tokens.access_token)
          localStorage.setItem('refresh_token', tokens.refresh_token)
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${tokens.access_token}`,
          }
          return client(originalRequest)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      } else {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default client
