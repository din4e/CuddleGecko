import client from './client'
import type { AuthResponse, User } from '../types'

export const authApi = {
  register: (username: string, email: string, password: string) =>
    client.post<AuthResponse>('/auth/register', { username, email, password }),
  login: (username: string, password: string) =>
    client.post<AuthResponse>('/auth/login', { username, password }),
  refresh: (refreshToken: string) =>
    client.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }),
  me: () => client.get<User>('/auth/me'),
}
