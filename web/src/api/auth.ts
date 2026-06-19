import { request } from './client'
import type { AuthResponse, User } from '../types'

interface CaptchaFields {
  captcha_id?: string
  captcha_answer?: string
}

export const authApi = {
  register: (username: string, email: string, password: string, captcha?: CaptchaFields) =>
    request.post<AuthResponse>('/auth/register', { username, email, password, ...captcha }).then((data) => ({ data })),
  login: (username: string, password: string, captcha?: CaptchaFields) =>
    request.post<AuthResponse>('/auth/login', { username, password, ...captcha }).then((data) => ({ data })),
  refresh: (refreshToken: string) =>
    request.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }).then((data) => ({ data })),
  me: () => request.get<User>('/auth/me').then((data) => ({ data })),
}
