import client from './client'

export interface CaptchaResponse {
  enabled: boolean
  captcha_id?: string
  captcha_image?: string
}

export const captchaApi = {
  get: () => client.get<CaptchaResponse>('/captcha'),
}
