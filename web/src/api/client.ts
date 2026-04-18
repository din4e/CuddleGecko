import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export function setBaseURL(url: string) {
  client.defaults.baseURL = url + '/api'
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => {
    // Unwrap backend { code, data, message } envelope
    if (response.data && typeof response.data === 'object' && 'data' in response.data && 'code' in response.data) {
      response.data = response.data.data
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const { data: refreshData } = await axios.post('/api/auth/refresh', {
            refresh_token: refreshToken,
          })
          const tokens = refreshData.data ? refreshData.data : refreshData
          localStorage.setItem('access_token', tokens.access_token)
          localStorage.setItem('refresh_token', tokens.refresh_token)
          originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`
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
