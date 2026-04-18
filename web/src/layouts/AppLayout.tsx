import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import {
  Heart,
  Network,
  Tag,
  Bell,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Globe,
  Settings,
  Calendar,
  Wallet,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import GeckoIcon from '../components/GeckoIcon'
import { BrandWordmark } from '../components/BrandWordmark'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed'

const navKeys = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/buddies', label: 'nav.contacts', icon: Heart },
  { to: '/graph', label: 'nav.network', icon: Network },
  { to: '/events', label: 'nav.events', icon: Calendar },
  { to: '/finance', label: 'nav.finance', icon: Wallet },
  { to: '/tags', label: 'nav.tags', icon: Tag },
  { to: '/reminders', label: 'nav.reminders', icon: Bell },
  { to: '/settings', label: 'nav.settings', icon: Settings },
]

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
  )

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('language', next)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const username = user?.username?.trim() || ''

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r bg-card p-4 transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[4.5rem] items-center overflow-x-hidden' : 'w-64',
        )}
      >
        <header
          className={cn('mb-4 w-full min-w-0', sidebarCollapsed && 'flex justify-center')}
          title={sidebarCollapsed && username ? username : undefined}
        >
          <h1 className={cn('flex min-w-0 items-center gap-2.5', sidebarCollapsed && 'justify-center')}>
            <GeckoIcon size={28} className="shrink-0" />
            {!sidebarCollapsed && (
              <BrandWordmark
                label={t('app.name')}
                compact
                align="start"
                className="min-w-0 flex-1 font-semibold"
              />
            )}
          </h1>
        </header>
        <nav className={cn('flex-1 space-y-1', sidebarCollapsed && 'flex w-full flex-col items-center')}>
          {navKeys.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={sidebarCollapsed ? t(label) : undefined}
              aria-label={t(label)}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md text-sm transition-colors',
                  sidebarCollapsed
                    ? 'size-10 justify-center p-0'
                    : 'gap-3 px-3 py-2',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{t(label)}</span>}
            </NavLink>
          ))}
        </nav>
        <footer
          className={cn(
            'mt-auto flex min-w-0 border-t border-border pt-4 w-full',
            sidebarCollapsed ? 'justify-center' : 'items-center justify-between gap-2',
          )}
        >
          {!sidebarCollapsed && (
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={username || undefined}>
              {username || '—'}
            </p>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? t('nav.sidebarExpand') : t('nav.sidebarCollapse')}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? t('nav.sidebarExpand') : t('nav.sidebarCollapse')}
            >
              {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            {!sidebarCollapsed && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={toggleLang}
                  title={i18n.language === 'zh' ? t('lang.en') : t('lang.zh')}
                >
                  <Globe className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={toggleTheme}
                  title={dark ? t('theme.light') : t('theme.dark')}
                >
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={handleLogout} title={t('nav.signOut')}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </footer>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
