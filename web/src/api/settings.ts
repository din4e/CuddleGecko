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

export interface KanbanColumn {
  id: string
  label: string
  kind: 'status' | 'priority' | 'tag'
  value: string
}

export interface KanbanConfig {
  columns: KanbanColumn[]
}

// Same shape as web/src/stores/graphSettings — the server stores the full
// canonical config and merges partial updates onto it.
export interface GraphSettings {
  nodeRadius: number
  emojiSize: number
  showLabels: boolean
  showSelf: boolean
  layoutMode: 'force' | 'cluster' | 'random'
  linkDistance: number
  chargeStrength: number
}

/** Web session (access token) lifetime; ttl_hours 0 = never expires. */
export interface SessionConfig {
  ttl_hours: number
}

export const settingsApi = {
  getCaptcha: () => request.get<CaptchaConfig>('/settings/captcha'),
  updateCaptcha: (config: Partial<CaptchaConfig>) =>
    request.put<CaptchaConfig>('/settings/captcha', config),
  getSession: () => request.get<SessionConfig>('/settings/session'),
  updateSession: (config: SessionConfig) =>
    request.put<SessionConfig>('/settings/session', config),
  getNav: () => request.get<NavConfig>('/settings/nav'),
  updateNav: (config: NavConfig) => request.put<NavConfig>('/settings/nav', config),
  getDashboard: () => request.get<DashboardConfig>('/settings/dashboard'),
  updateDashboard: (config: DashboardConfig) => request.put<DashboardConfig>('/settings/dashboard', config),
  getKanban: () => request.get<KanbanConfig>('/settings/kanban'),
  updateKanban: (config: KanbanConfig) => request.put<KanbanConfig>('/settings/kanban', config),
  getGraph: () => request.get<GraphSettings>('/settings/graph'),
  updateGraph: (config: Partial<GraphSettings>) => request.put<GraphSettings>('/settings/graph', config),
}
