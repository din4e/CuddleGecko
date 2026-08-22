// Route modules stay lazy so the initial bundle remains small. The sidebar and
// contact links call preloadPage on intent (hover, keyboard focus, touch), which
// starts downloading the next page before navigation commits.
export const loadDashboardPage = () => import('@/pages/DashboardPage')
export const loadContactsPage = () => import('@/pages/ContactsPage')
export const loadContactDetailPage = () => import('@/pages/ContactDetailPage')
export const loadGraphPage = () => import('@/pages/GraphPage')
const loadForceGraph = () => import('react-force-graph-2d')
export const loadEventsPage = () => import('@/pages/EventsPage')
export const loadTodosPage = () => import('@/pages/TodosPage')
export const loadHabitsPage = () => import('@/pages/HabitsPage')
export const loadPomodoroPage = () => import('@/pages/PomodoroPage')
export const loadCalendarPage = () => import('@/pages/CalendarPage')
export const loadFinancePage = () => import('@/pages/FinancePage')
export const loadTagsPage = () => import('@/pages/TagsPage')
export const loadRemindersPage = () => import('@/pages/RemindersPage')
export const loadAIChatPage = () => import('@/pages/AIChatPage')
export const loadTerminalPage = () => import('@/pages/TerminalPage')
export const loadSettingsPage = () => import('@/pages/SettingsPage')

const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/': loadDashboardPage,
  '/buddies': loadContactsPage,
  // The graph renderer is intentionally excluded from the initial bundle, but
  // fetching it on explicit navigation intent removes the otherwise noticeable
  // delay after opening the network page.
  '/graph': () => Promise.all([loadGraphPage(), loadForceGraph()]),
  '/events': loadEventsPage,
  '/todos': loadTodosPage,
  '/habits': loadHabitsPage,
  '/pomodoro': loadPomodoroPage,
  '/calendar': loadCalendarPage,
  '/finance': loadFinancePage,
  '/tags': loadTagsPage,
  '/reminders': loadRemindersPage,
  '/ai': loadAIChatPage,
  '/terminal': loadTerminalPage,
  '/settings': loadSettingsPage,
}

export function preloadPage(path: string) {
  const loader = routeLoaders[path]
  if (loader) void loader().catch(() => {})
}
