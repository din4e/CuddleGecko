import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
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
  Bot,
  Menu,
} from 'lucide-react'
import GeckoIcon from '../components/GeckoIcon'
import { BrandWordmark } from '../components/BrandWordmark'
import DesktopMenuListener from '../components/DesktopMenuListener'
import WindowTitleBar from '../components/WindowTitleBar'
import WorkspaceSwitcher from '../components/WorkspaceSwitcher'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed'

const navKeys = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/buddies', label: 'nav.contacts', icon: Heart },
  { to: '/graph', label: 'nav.network', icon: Network },
  { to: '/events', label: 'nav.events', icon: Calendar },
  { to: '/finance', label: 'nav.finance', icon: Wallet },
  { to: '/ai', label: 'nav.ai', icon: Bot },
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
    document.documentElement.style.colorScheme = next ? 'dark' : 'light'
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  useEffect(() => {
    document.documentElement.style.colorScheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  }, [])

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
  const initial = username ? username[0].toUpperCase() : '?'

  return (
    <div className="h-screen flex flex-col bg-background">
      <DesktopMenuListener />
      <WindowTitleBar />
      <div className="flex flex-1 min-h-0">

      {/* Sidebar */}
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[4.5rem] items-center overflow-x-hidden px-2 py-4' : 'w-64 p-4',
        )}
      >
        <header className={cn('mb-4 w-full min-w-0', sidebarCollapsed && 'flex justify-center')}>
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
          {!sidebarCollapsed && <WorkspaceSwitcher />}
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

        {/* Sidebar bottom: only collapse toggle */}
        <div className={cn('mt-auto pt-2', sidebarCollapsed ? '' : 'border-t border-border pt-4')}>
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
        </div>
      </aside>

      {/* Main area: header + content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 backdrop-blur-sm px-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 lg:hidden"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? t('nav.sidebarExpand') : t('nav.sidebarCollapse')}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={toggleLang}
              title={i18n.language === 'zh' ? t('lang.en') : t('lang.zh')}
              aria-label={i18n.language === 'zh' ? t('lang.en') : t('lang.zh')}
            >
              <Globe className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={toggleTheme}
              title={dark ? t('theme.light') : t('theme.dark')}
              aria-label={dark ? t('theme.light') : t('theme.dark')}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
                aria-label={t('nav.userMenu')}
              >
                <Avatar size="sm">
                  <AvatarFallback className="text-xs font-medium">{initial}</AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && username && (
                  <span className="hidden sm:inline text-sm text-foreground truncate max-w-[120px]">{username}</span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                {username && (
                  <>
                    <div className="px-2 py-1.5 text-sm font-medium text-foreground truncate">{username}</div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-1.5 h-4 w-4" />
                  {t('nav.settings')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-1.5 h-4 w-4" />
                  {t('nav.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto min-h-0">
          <div className="h-full flex flex-col p-6">
            <Outlet />
          </div>
        </main>
      </div>
      </div>
    </div>
  )
}
