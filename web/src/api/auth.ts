import client from './client'
import type { AuthResponse, User } from '../types'

interface CaptchaFields {
  captcha_id?: string
  captcha_answer?: string
}

export const authApi = {
  register: (username: string, email: string, password: string, captcha?: CaptchaFields) =>
    client.post<AuthResponse>('/auth/register', { username, email, password, ...captcha }),
  login: (username: string, password: string, captcha?: CaptchaFields) =>
    client.post<AuthResponse>('/auth/login', { username, password, ...captcha }),
  refresh: (refreshToken: string) =>
    client.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }),
  me: () => client.get<User>('/auth/me'),
}
