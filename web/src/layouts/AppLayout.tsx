import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import { Contact, Network, Tag, Bell, LayoutDashboard, LogOut, Moon, Sun } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contacts', label: 'Contacts', icon: Contact },
  { to: '/graph', label: 'Network', icon: Network },
  { to: '/tags', label: 'Tags', icon: Tag },
  { to: '/reminders', label: 'Reminders', icon: Bell },
]

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r bg-card p-4 flex flex-col">
        <div className="flex items-center justify-between px-2 mb-6">
          <h1 className="text-xl font-bold">CuddleGecko</h1>
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
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
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t pt-4 mt-4">
          <div className="px-3 py-2 text-sm text-muted-foreground">{user?.username}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
