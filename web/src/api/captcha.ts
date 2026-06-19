import { request } from './client'

export interface CaptchaResponse {
  enabled: boolean
  captcha_id?: string
  captcha_image?: string
}

export const captchaApi = {
  get: () => request.get<CaptchaResponse>('/captcha').then((data) => ({ data })),
}
