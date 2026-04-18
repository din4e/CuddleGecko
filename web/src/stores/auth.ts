import { create } from 'zustand'
import { authApi } from '../api/auth'
import type { User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string, captcha?: { captcha_id: string; captcha_answer: string }) => Promise<void>
  register: (username: string, email: string, password: string, captcha?: { captcha_id: string; captcha_answer: string }) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,

  login: async (username, password, captcha) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.login(username, password, captcha)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      set({ user: data.user, accessToken: data.access_token, isAuthenticated: true })
    } finally {
      set({ isLoading: false })
    }
  },

  register: async (username, email, password, captcha) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.register(username, email, password, captcha)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      set({ user: data.user, accessToken: data.access_token, isAuthenticated: true })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    if (!localStorage.getItem('access_token')) {
      set({ isAuthenticated: false })
      return
    }
    try {
      const { data } = await authApi.me()
      set({ user: data, isAuthenticated: true })
    } catch {
      set({ user: null, accessToken: null, isAuthenticated: false })
    }
  },
}))
