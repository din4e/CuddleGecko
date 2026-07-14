import { Network, Calendar, ListChecks, Wallet, Bot, Tag, Bell, Flame, Timer, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface CustomizableNavItem {
  to: string
  label: string
  icon: LucideIcon
}

// Sidebar nav items the user can reorder / hide (dashboard, contacts, settings stay fixed).
export const CUSTOMIZABLE_NAV: CustomizableNavItem[] = [
  { to: '/graph', label: 'nav.network', icon: Network },
  { to: '/events', label: 'nav.events', icon: Calendar },
  { to: '/todos', label: 'nav.todos', icon: ListChecks },
  { to: '/habits', label: 'nav.habits', icon: Flame },
  { to: '/pomodoro', label: 'nav.pomodoro', icon: Timer },
  { to: '/calendar', label: 'nav.calendar', icon: CalendarDays },
  { to: '/finance', label: 'nav.finance', icon: Wallet },
  { to: '/ai', label: 'nav.ai', icon: Bot },
  { to: '/tags', label: 'nav.tags', icon: Tag },
  { to: '/reminders', label: 'nav.reminders', icon: Bell },
]

// Default order (route paths).
export const DEFAULT_NAV_ORDER: string[] = CUSTOMIZABLE_NAV.map((n) => n.to)

export const CUSTOMIZABLE_PATHS: Set<string> = new Set(CUSTOMIZABLE_NAV.map((n) => n.to))
