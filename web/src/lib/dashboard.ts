// Customizable dashboard widgets. The DashboardPage maps each id to its rendered card.
// `stats`, `quickActions`, and `trend` are full-width; the three list widgets (events/reminders/todos)
// share a row in the default 3-column grid.
export const DASHBOARD_WIDGET_IDS = [
  'stats',
  'quickActions',
  'network',
  'events',
  'reminders',
  'todos',
  'trend',
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

// Default order (widget ids).
export const DEFAULT_DASHBOARD_ORDER: string[] = [...DASHBOARD_WIDGET_IDS]

// Widgets that span the full row; the rest are 1 column wide.
export const FULL_WIDTH_WIDGETS: Set<string> = new Set(['stats', 'quickActions', 'network', 'trend'])
