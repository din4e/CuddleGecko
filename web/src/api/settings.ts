import { request } from './client'

export interface CaptchaConfig {
  enabled: boolean
  length: number
}

export const settingsApi = {
  getCaptcha: () => request.get<CaptchaConfig>('/settings/captcha'),
  updateCaptcha: (config: Partial<CaptchaConfig>) =>
    request.put<CaptchaConfig>('/settings/captcha', config),
}
