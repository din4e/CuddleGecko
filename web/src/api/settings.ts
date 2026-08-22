import { request } from './client'

export interface CaptchaConfig {
  enabled: boolean
  length: number
}

export interface NavConfig {
  order: string[]
  hidden: string[]
}

// Same shape as NavConfig — the customizable dashboard widget layout (order + hidden widget ids).
export interface DashboardConfig {
  order: string[]
  hidden: string[]
}

export const settingsApi = {
  getCaptcha: () => request.get<CaptchaConfig>('/settings/captcha'),
  updateCaptcha: (config: Partial<CaptchaConfig>) =>
    request.put<CaptchaConfig>('/settings/captcha', config),
  getNav: () => request.get<NavConfig>('/settings/nav'),
  updateNav: (config: NavConfig) => request.put<NavConfig>('/settings/nav', config),
  getDashboard: () => request.get<DashboardConfig>('/settings/dashboard'),
  updateDashboard: (config: DashboardConfig) => request.put<DashboardConfig>('/settings/dashboard', config),
}
