import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import { Heart, Network, Tag, Bell, LayoutDashboard, LogOut, Moon, Sun, Globe, Settings, Calendar, Wallet } from 'lucide-react'
import GeckoIcon from '../components/GeckoIcon'
import { BrandWordmark } from '../components/BrandWordmark'

const navKeys = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/contacts', label: 'nav.contacts', icon: Heart },
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

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card p-4">
        <header className="mb-4">
          <h1 className="flex min-w-0 items-center gap-2.5">
            <GeckoIcon size={28} className="shrink-0" />
            <BrandWordmark
              label={t('app.name')}
              compact
              align="start"
              className="min-w-0 flex-1 font-semibold"
            />
          </h1>
        </header>
        <nav className="flex-1 space-y-1">
          {navKeys.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <footer className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-border pt-4">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={user?.username}>
            {user?.username}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
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
