# CuddleGecko React Frontend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete React SPA frontend for CuddleGecko — a personal CRM with contacts, tags, interactions, reminders, and network graph visualization.

**Architecture:** Vite SPA in `web/` directory. Zustand stores for state, Axios API client with JWT interceptors, React Router v6 for navigation, shadcn/ui components, react-force-graph-2d for network visualization.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, React Router v6, Axios, react-force-graph-2d, Recharts, Lucide React

---

## Task 1: Project Scaffold

**Files:**
- Create: `web/` (entire Vite project)

- [ ] **Step 1: Create Vite project with React + TypeScript**

Run:
```bash
npm create vite@latest web -- --template react-ts
cd web
npm install
```

- [ ] **Step 2: Install all dependencies**

Run:
```bash
cd web
npm install react-router-dom zustand axios lucide-react recharts react-force-graph-2d
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind**

Update `web/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

Update `web/src/index.css`:
```css
@import "tailwindcss";
```

Update `web/tsconfig.json` — add to `compilerOptions`:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

Also create `web/tsconfig.app.json` if Vite generated one, add the same paths config.

- [ ] **Step 4: Initialize shadcn/ui**

Run:
```bash
cd web
npx shadcn@latest init -d
```

When prompted, choose:
- Style: Default (New York)
- Base color: Neutral
- CSS Variables: yes

Then install commonly needed components:
```bash
npx shadcn@latest add button input label card dialog badge tabs select textarea separator dropdown-menu avatar table toast sonner tooltip
```

- [ ] **Step 5: Verify dev server starts**

Run: `cd web && npm run dev`
Expected: Vite dev server starts on http://localhost:5173

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: React frontend scaffold with Vite, Tailwind, shadcn/ui"
```

---

## Task 2: TypeScript Types + API Client

**Files:**
- Create: `web/src/types/index.ts`
- Create: `web/src/api/client.ts`
- Create: `web/src/api/auth.ts`
- Create: `web/src/api/contacts.ts`
- Create: `web/src/api/tags.ts`
- Create: `web/src/api/interactions.ts`
- Create: `web/src/api/reminders.ts`
- Create: `web/src/api/relations.ts`
- Create: `web/src/api/graph.ts`

- [ ] **Step 1: Create TypeScript types matching backend models**

```ts
// web/src/types/index.ts

export type RelationshipType = 'family' | 'friend' | 'colleague' | 'client' | 'other'

export type InteractionType = 'meeting' | 'call' | 'message' | 'email' | 'other'

export type ReminderStatus = 'pending' | 'done' | 'snoozed'

export interface User {
  id: number
  username: string
  email: string
  created_at: string
  updated_at: string
}

export interface Contact {
  id: number
  user_id: number
  name: string
  nickname: string
  avatar_url: string
  phone: string
  email: string
  birthday: string | null
  notes: string
  relationship_type: RelationshipType
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  user_id: number
  name: string
  color: string
  created_at: string
}

export interface Interaction {
  id: number
  user_id: number
  contact_id: number
  type: InteractionType
  title: string
  content: string
  occurred_at: string
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: number
  user_id: number
  contact_id: number
  title: string
  description: string
  remind_at: string
  status: ReminderStatus
  created_at: string
  updated_at: string
}

export interface ContactRelation {
  id: number
  user_id: number
  contact_id_a: number
  contact_id_b: number
  relation_type: string
  created_at: string
}

export interface GraphNode {
  id: number
  name: string
  relationship_type: string
  avatar_url: string
}

export interface GraphEdge {
  source: number
  target: number
  relation_type: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AuthResponse {
  user: User
  access_token: string
  refresh_token: string
}

export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
```

- [ ] **Step 2: Create Axios API client with JWT interceptors**

```ts
// web/src/api/client.ts
import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/auth/refresh', {
            refresh_token: refreshToken,
          })
          localStorage.setItem('access_token', data.data.access_token)
          localStorage.setItem('refresh_token', data.data.refresh_token)
          originalRequest.headers.Authorization = `Bearer ${data.data.access_token}`
          return client(originalRequest)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      } else {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default client
```

- [ ] **Step 3: Create API modules per domain**

```ts
// web/src/api/auth.ts
import client from './client'
import type { AuthResponse, User } from '../types'

export const authApi = {
  register: (username: string, email: string, password: string) =>
    client.post<AuthResponse>('/auth/register', { username, email, password }),
  login: (username: string, password: string) =>
    client.post<AuthResponse>('/auth/login', { username, password }),
  refresh: (refreshToken: string) =>
    client.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }),
  me: () => client.get<User>('/auth/me'),
}
```

```ts
// web/src/api/contacts.ts
import client from './client'
import type { Contact, Tag, PaginatedData } from '../types'

export const contactsApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; tag_ids?: number[] }) =>
    client.get<PaginatedData<Contact>>('/contacts', { params }),
  create: (data: Partial<Contact>) => client.post<Contact>('/contacts', data),
  get: (id: number) => client.get<Contact>(`/contacts/${id}`),
  update: (id: number, data: Partial<Contact>) => client.put<Contact>(`/contacts/${id}`, data),
  delete: (id: number) => client.delete(`/contacts/${id}`),
  getTags: (id: number) => client.get<Tag[]>(`/contacts/${id}/tags`),
  replaceTags: (id: number, tagIds: number[]) => client.put(`/contacts/${id}/tags`, { tag_ids: tagIds }),
}
```

```ts
// web/src/api/tags.ts
import client from './client'
import type { Tag } from '../types'

export const tagsApi = {
  list: () => client.get<Tag[]>('/tags'),
  create: (data: { name: string; color: string }) => client.post<Tag>('/tags', data),
  update: (id: number, data: Partial<Tag>) => client.put<Tag>(`/tags/${id}`, data),
  delete: (id: number) => client.delete(`/tags/${id}`),
}
```

```ts
// web/src/api/interactions.ts
import client from './client'
import type { Interaction, PaginatedData } from '../types'

export const interactionsApi = {
  list: (contactId: number, params?: { page?: number; page_size?: number }) =>
    client.get<PaginatedData<Interaction>>(`/contacts/${contactId}/interactions`, { params }),
  create: (contactId: number, data: Partial<Interaction>) =>
    client.post<Interaction>(`/contacts/${contactId}/interactions`, data),
  update: (id: number, data: Partial<Interaction>) => client.put<Interaction>(`/interactions/${id}`, data),
  delete: (id: number) => client.delete(`/interactions/${id}`),
}
```

```ts
// web/src/api/reminders.ts
import client from './client'
import type { Reminder, ReminderStatus } from '../types'

export const remindersApi = {
  list: (status?: ReminderStatus) => client.get<Reminder[]>('/reminders', { params: { status } }),
  create: (contactId: number, data: Partial<Reminder>) =>
    client.post<Reminder>(`/contacts/${contactId}/reminders`, data),
  update: (id: number, data: Partial<Reminder>) => client.put<Reminder>(`/reminders/${id}`, data),
  delete: (id: number) => client.delete(`/reminders/${id}`),
}
```

```ts
// web/src/api/relations.ts
import client from './client'
import type { ContactRelation } from '../types'

export const relationsApi = {
  list: (contactId: number) => client.get<ContactRelation[]>(`/contacts/${contactId}/relations`),
  create: (contactId: number, data: { contact_id_b: number; relation_type: string }) =>
    client.post<ContactRelation>(`/contacts/${contactId}/relations`, data),
  delete: (id: number) => client.delete(`/relations/${id}`),
}
```

```ts
// web/src/api/graph.ts
import client from './client'
import type { GraphData } from '../types'

export const graphApi = {
  get: () => client.get<GraphData>('/graph'),
}
```

- [ ] **Step 4: Build and verify**

Run: `cd web && npm run build`
Expected: compiles clean

- [ ] **Step 5: Commit**

```bash
git add web/src/types/ web/src/api/
git commit -m "feat: TypeScript types and API client with JWT interceptors"
```

---

## Task 3: Auth Store + Login/Register Pages

**Files:**
- Create: `web/src/stores/auth.ts`
- Create: `web/src/pages/LoginPage.tsx`
- Create: `web/src/pages/RegisterPage.tsx`

- [ ] **Step 1: Create auth store**

```ts
// web/src/stores/auth.ts
import { create } from 'zustand'
import { authApi } from '../api/auth'
import type { User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.login(username, password)
      const resp = data.data ? data.data : data
      localStorage.setItem('access_token', resp.access_token)
      localStorage.setItem('refresh_token', resp.refresh_token)
      set({ user: resp.user, accessToken: resp.access_token, isAuthenticated: true })
    } finally {
      set({ isLoading: false })
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.register(username, email, password)
      const resp = data.data ? data.data : data
      localStorage.setItem('access_token', resp.access_token)
      localStorage.setItem('refresh_token', resp.refresh_token)
      set({ user: resp.user, accessToken: resp.access_token, isAuthenticated: true })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    if (!localStorage.getItem('access_token')) {
      set({ isAuthenticated: false })
      return
    }
    try {
      const { data } = await authApi.me()
      const user = data.data ? data.data : data
      set({ user, isAuthenticated: true })
    } catch {
      set({ user: null, accessToken: null, isAuthenticated: false })
    }
  },
}))
```

- [ ] **Step 2: Create LoginPage**

```tsx
// web/src/pages/LoginPage.tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const login = useAuthStore((s) => s.login)
  const isLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">CuddleGecko</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Don't have an account? <Link to="/register" className="text-primary underline">Register</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Create RegisterPage**

```tsx
// web/src/pages/RegisterPage.tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const register = useAuthStore((s) => s.register)
  const isLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await register(username, email, password)
      navigate('/')
    } catch {
      setError('Registration failed. Username may already exist.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">CuddleGecko</CardTitle>
          <CardDescription>Create your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Register'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account? <Link to="/login" className="text-primary underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Build and verify**

Run: `cd web && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web/src/stores/ web/src/pages/LoginPage.tsx web/src/pages/RegisterPage.tsx
git commit -m "feat: auth store with login/register pages"
```

---

## Task 4: App Layout + Routing

**Files:**
- Create: `web/src/layouts/AppLayout.tsx`
- Create: `web/src/components/ProtectedRoute.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create ProtectedRoute**

```tsx
// web/src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 2: Create AppLayout with sidebar**

```tsx
// web/src/layouts/AppLayout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { Button } from '../components/ui/button'
import { Contacts, Network, Tag, Bell, LayoutDashboard, LogOut } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contacts', label: 'Contacts', icon: Contacts },
  { to: '/graph', label: 'Network', icon: Network },
  { to: '/tags', label: 'Tags', icon: Tag },
  { to: '/reminders', label: 'Reminders', icon: Bell },
]

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r bg-card p-4 flex flex-col">
        <h1 className="text-xl font-bold px-2 mb-6">CuddleGecko</h1>
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
```

- [ ] **Step 3: Update App.tsx with routing**

```tsx
// web/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<div className="text-2xl font-bold">Dashboard</div>} />
          <Route path="contacts" element={<div className="text-2xl font-bold">Contacts</div>} />
          <Route path="contacts/:id" element={<div className="text-2xl font-bold">Contact Detail</div>} />
          <Route path="graph" element={<div className="text-2xl font-bold">Network Graph</div>} />
          <Route path="tags" element={<div className="text-2xl font-bold">Tags</div>} />
          <Route path="reminders" element={<div className="text-2xl font-bold">Reminders</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Clean up App.css and index.css if needed, remove default Vite content**

Delete `web/src/App.css` if it exists. Make sure `web/src/main.tsx` imports `./index.css`.

- [ ] **Step 5: Verify dev server**

Run: `cd web && npm run dev`
Expected: App loads, sidebar visible, login redirect works

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: app layout with sidebar navigation and route protection"
```

---

## Task 5: Dashboard Page

**Files:**
- Create: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/App.tsx` (replace placeholder)

- [ ] **Step 1: Create DashboardPage**

```tsx
// web/src/pages/DashboardPage.tsx
import { useEffect, useState } from 'react'
import { contactsApi } from '../api/contacts'
import { remindersApi } from '../api/reminders'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import type { Contact, Reminder } from '../types'
import { Users, CalendarCheck, Bell } from 'lucide-react'

export default function DashboardPage() {
  const [totalContacts, setTotalContacts] = useState(0)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      contactsApi.list({ page: 1, page_size: 1 }),
      remindersApi.list('pending'),
    ])
      .then(([contactsRes, remindersRes]) => {
        const contactsData = contactsRes.data.data ? contactsRes.data.data : contactsRes.data
        const remindersData = remindersRes.data.data ? remindersRes.data.data : remindersRes.data
        setTotalContacts(contactsData.total || 0)
        setReminders(Array.isArray(remindersData) ? remindersData : [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div>Loading...</div>

  const stats = [
    { title: 'Total Contacts', value: totalContacts, icon: Users },
    { title: 'Pending Reminders', value: reminders.length, icon: Bell },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {stats.map(({ title, value, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {reminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              Upcoming Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {reminders.slice(0, 5).map((r) => (
                <li key={r.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(r.remind_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx to use DashboardPage**

In `web/src/App.tsx`, replace the dashboard placeholder:
```tsx
import DashboardPage from './pages/DashboardPage'
// ...
<Route index element={<DashboardPage />} />
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/DashboardPage.tsx web/src/App.tsx
git commit -m "feat: dashboard with stats cards and upcoming reminders"
```

---

## Task 6: Contacts (List + Detail Pages)

**Files:**
- Create: `web/src/pages/ContactsPage.tsx`
- Create: `web/src/pages/ContactDetailPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create ContactsPage with search, filter, pagination**

```tsx
// web/src/pages/ContactsPage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contactsApi } from '../api/contacts'
import { tagsApi } from '../api/tags'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import type { Contact, Tag } from '../types'
import { Plus, Search } from 'lucide-react'

const relationshipLabels: Record<string, string> = {
  family: 'Family', friend: 'Friend', colleague: 'Colleague', client: 'Client', other: 'Other',
}

const relationshipColors: Record<string, string> = {
  family: 'bg-pink-100 text-pink-800',
  friend: 'bg-green-100 text-green-800',
  colleague: 'bg-blue-100 text-blue-800',
  client: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', relationship_type: 'other' as const })

  const pageSize = 12

  const loadContacts = async () => {
    setLoading(true)
    try {
      const res = await contactsApi.list({ page, page_size: pageSize, search: search || undefined })
      const data = res.data.data ? res.data.data : res.data
      setContacts(data.items || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { tagsApi.list().then(res => setTags(res.data.data || res.data)).catch(() => {}) }, [])

  useEffect(() => { loadContacts() }, [page, search])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await contactsApi.create(newContact)
    setDialogOpen(false)
    setNewContact({ name: '', email: '', phone: '', relationship_type: 'other' })
    loadContacts()
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Contact</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={newContact.relationship_type} onValueChange={(v) => setNewContact({ ...newContact, relationship_type: v as Contact['relationship_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(relationshipLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create Contact</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No contacts found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <Link key={contact.id} to={`/contacts/${contact.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-semibold">
                      {contact.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{contact.name}</div>
                      {contact.email && <div className="text-sm text-muted-foreground truncate">{contact.email}</div>}
                    </div>
                    <Badge variant="secondary" className={relationshipColors[contact.relationship_type] || ''}>
                      {relationshipLabels[contact.relationship_type] || contact.relationship_type}
                    </Badge>
                  </div>
                  {contact.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {contact.tags.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-xs" style={{ borderColor: t.color, color: t.color }}>
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create ContactDetailPage with tabs**

```tsx
// web/src/pages/ContactDetailPage.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { contactsApi } from '../api/contacts'
import { interactionsApi } from '../api/interactions'
import { remindersApi } from '../api/reminders'
import { relationsApi } from '../api/relations'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import type { Contact, Interaction, Reminder, ContactRelation } from '../types'
import { ArrowLeft, Mail, Phone, Calendar } from 'lucide-react'

export default function ContactDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [relations, setRelations] = useState<ContactRelation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const contactId = parseInt(id)
    setLoading(true)
    Promise.all([
      contactsApi.get(contactId),
      interactionsApi.list(contactId, { page: 1, page_size: 50 }),
      remindersApi.list(),
      relationsApi.list(contactId),
    ])
      .then(([contactRes, interactionsRes, remindersRes, relationsRes]) => {
        const c = contactRes.data.data ? contactRes.data.data : contactRes.data
        const iData = interactionsRes.data.data ? interactionsRes.data.data : interactionsRes.data
        const rData = remindersRes.data.data ? remindersRes.data.data : remindersRes.data
        const relData = relationsRes.data.data ? relationsRes.data.data : relationsRes.data
        setContact(c)
        setInteractions(iData.items || [])
        setReminders((Array.isArray(rData) ? rData : []).filter((r: Reminder) => r.contact_id === contactId))
        setRelations(Array.isArray(relData) ? relData : [])
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div>Loading...</div>
  if (!contact) return <div>Contact not found</div>

  const handleDelete = async () => {
    if (confirm('Delete this contact?')) {
      await contactsApi.delete(contact.id)
      navigate('/contacts')
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/contacts')}>
        <ArrowLeft className="h-4 w-4 mr-2" />Back to Contacts
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{contact.name}</CardTitle>
              {contact.nickname && <p className="text-muted-foreground">{contact.nickname}</p>}
            </div>
            <div className="flex gap-2">
              <Badge>{contact.relationship_type}</Badge>
              <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {contact.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" />{contact.email}</div>}
            {contact.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{contact.phone}</div>}
            {contact.birthday && <div className="flex items-center gap-2"><Calendar className="h-4 w-4" />{new Date(contact.birthday).toLocaleDateString()}</div>}
          </div>
          {contact.notes && <p className="mt-4 text-sm text-muted-foreground">{contact.notes}</p>}
          {contact.tags?.length > 0 && (
            <div className="flex gap-1 mt-4">
              {contact.tags.map((t) => (
                <Badge key={t.id} variant="outline" style={{ borderColor: t.color, color: t.color }}>{t.name}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="interactions">
        <TabsList>
          <TabsTrigger value="interactions">Interactions ({interactions.length})</TabsTrigger>
          <TabsTrigger value="reminders">Reminders ({reminders.length})</TabsTrigger>
          <TabsTrigger value="relations">Relations ({relations.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="interactions" className="mt-4">
          {interactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No interactions recorded</p>
          ) : (
            <div className="space-y-3">
              {interactions.map((i) => (
                <Card key={i.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{i.title}</div>
                        <Badge variant="secondary" className="mt-1">{i.type}</Badge>
                        {i.content && <p className="text-sm text-muted-foreground mt-2">{i.content}</p>}
                      </div>
                      <span className="text-sm text-muted-foreground">{new Date(i.occurred_at).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="reminders" className="mt-4">
          {reminders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No reminders</p>
          ) : (
            <div className="space-y-3">
              {reminders.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                    </div>
                    <div className="text-right">
                      <Badge variant={r.status === 'pending' ? 'default' : 'secondary'}>{r.status}</Badge>
                      <div className="text-sm text-muted-foreground mt-1">{new Date(r.remind_at).toLocaleDateString()}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="relations" className="mt-4">
          {relations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No relations</p>
          ) : (
            <div className="space-y-3">
              {relations.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Related to contact #{r.contact_id_a === contact.id ? r.contact_id_b : r.contact_id_a}</span>
                      <Badge variant="outline">{r.relation_type || 'connected'}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx routes for contacts**

Replace the contact route placeholders in `web/src/App.tsx`:
```tsx
import ContactsPage from './pages/ContactsPage'
import ContactDetailPage from './pages/ContactDetailPage'
// ...
<Route path="contacts" element={<ContactsPage />} />
<Route path="contacts/:id" element={<ContactDetailPage />} />
```

- [ ] **Step 4: Build and verify**

Run: `cd web && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/ContactsPage.tsx web/src/pages/ContactDetailPage.tsx web/src/App.tsx
git commit -m "feat: contacts list and detail pages with search, filter, tabs"
```

---

## Task 7: Tags Page

**Files:**
- Create: `web/src/pages/TagsPage.tsx`

- [ ] **Step 1: Create TagsPage**

```tsx
// web/src/pages/TagsPage.tsx
import { useEffect, useState } from 'react'
import { tagsApi } from '../api/tags'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Badge } from '../components/ui/badge'
import type { Tag } from '../types'
import { Plus, Trash2, Pencil } from 'lucide-react'

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')

  const loadTags = async () => {
    const res = await tagsApi.list()
    setTags(res.data.data || res.data)
  }

  useEffect(() => { loadTags() }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingTag) {
      await tagsApi.update(editingTag.id, { name, color })
    } else {
      await tagsApi.create({ name, color })
    }
    setDialogOpen(false)
    setEditingTag(null)
    setName('')
    setColor('#6366f1')
    loadTags()
  }

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag)
    setName(tag.name)
    setColor(tag.color || '#6366f1')
    setDialogOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (confirm('Delete this tag?')) {
      await tagsApi.delete(id)
      loadTags()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tags</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingTag(null) }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Tag</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingTag ? 'Edit Tag' : 'New Tag'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
                </div>
              </div>
              <Button type="submit" className="w-full">{editingTag ? 'Update' : 'Create'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tags.map((tag) => (
          <Card key={tag.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(tag)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(tag.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
      {tags.length === 0 && <p className="text-center text-muted-foreground py-12">No tags yet. Create one above.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx route for tags**

Replace tags route placeholder with `<Route path="tags" element={<TagsPage />} />`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/TagsPage.tsx web/src/App.tsx
git commit -m "feat: tag manager page with color picker and CRUD"
```

---

## Task 8: Reminders Page

**Files:**
- Create: `web/src/pages/RemindersPage.tsx`

- [ ] **Step 1: Create RemindersPage**

```tsx
// web/src/pages/RemindersPage.tsx
import { useEffect, useState } from 'react'
import { remindersApi } from '../api/reminders'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import type { Reminder, ReminderStatus } from '../types'
import { CheckCircle, Clock, AlertCircle } from 'lucide-react'

const statusConfig: Record<string, { icon: typeof Clock; label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  pending: { icon: Clock, label: 'Pending', variant: 'default' },
  done: { icon: CheckCircle, label: 'Done', variant: 'secondary' },
  snoozed: { icon: AlertCircle, label: 'Snoozed', variant: 'outline' },
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | ''>('')
  const [loading, setLoading] = useState(true)

  const loadReminders = async () => {
    setLoading(true)
    try {
      const res = await remindersApi.list(statusFilter || undefined)
      setReminders(res.data.data || res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReminders() }, [statusFilter])

  const handleMarkDone = async (id: number) => {
    await remindersApi.update(id, { status: 'done' } as Partial<Reminder>)
    loadReminders()
  }

  const handleDelete = async (id: number) => {
    if (confirm('Delete this reminder?')) {
      await remindersApi.delete(id)
      loadReminders()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reminders</h1>
      <div className="flex gap-2">
        {['', 'pending', 'done', 'snoozed'].map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s as ReminderStatus | '')}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      {loading ? <div>Loading...</div> : reminders.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No reminders found</p>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => {
            const cfg = statusConfig[r.status] || statusConfig.pending
            const Icon = cfg.icon
            return (
              <Card key={r.id}>
                <CardContent className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{r.title}</div>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                      <div className="text-xs text-muted-foreground mt-1">{new Date(r.remind_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {r.status === 'pending' && (
                      <Button size="sm" variant="outline" onClick={() => handleMarkDone(r.id)}>Done</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>Delete</Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx route for reminders**

Replace reminders route placeholder with `<Route path="reminders" element={<RemindersPage />} />`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/RemindersPage.tsx web/src/App.tsx
git commit -m "feat: reminders page with status filtering"
```

---

## Task 9: Network Graph Page

**Files:**
- Create: `web/src/pages/GraphPage.tsx`

- [ ] **Step 1: Create GraphPage with react-force-graph-2d**

```tsx
// web/src/pages/GraphPage.tsx
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { graphApi } from '../api/graph'
import type { GraphData } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const relationshipColors: Record<string, string> = {
  family: '#ec4899',
  friend: '#22c55e',
  colleague: '#3b82f6',
  client: '#a855f7',
  other: '#6b7280',
}

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const fgRef = useRef<any>()

  useEffect(() => {
    graphApi.get()
      .then((res) => {
        const data = res.data.data ? res.data.data : res.data
        setGraphData(data)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleNodeClick = useCallback((node: any) => {
    navigate(`/contacts/${node.id}`)
  }, [navigate])

  if (loading) return <div>Loading graph...</div>
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Network Graph</h1>
        <p className="text-center text-muted-foreground py-12">Add contacts and relations to see your network graph.</p>
      </div>
    )
  }

  const fgData = {
    nodes: graphData.nodes.map((n) => ({ ...n, id: n.id })),
    links: graphData.edges.map((e) => ({ source: e.source, target: e.target, relation_type: e.relation_type })),
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Network Graph</h1>
      <Card>
        <CardContent className="p-0">
          <ForceGraph2D
            ref={fgRef}
            graphData={fgData}
            nodeLabel="name"
            nodeColor={(node: any) => relationshipColors[node.relationship_type] || '#6b7280'}
            nodeVal={(node: any) => {
              const links = fgData.links.filter((l: any) => l.source.id === node.id || l.target.id === node.id)
              return links.length + 1
            }}
            linkLabel="relation_type"
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.name
              const fontSize = 12 / globalScale
              ctx.font = `${fontSize}px Sans-Serif`
              const textWidth = ctx.measureText(label).width
              const bckgDimensions = [textWidth, fontSize].map((s) => s + fontSize * 0.4)
              const r = Math.max(...bckgDimensions) / 2

              ctx.fillStyle = relationshipColors[node.relationship_type] || '#6b7280'
              ctx.globalAlpha = 0.1
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
              ctx.fill()
              ctx.globalAlpha = 1

              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillStyle = '#333'
              ctx.fillText(label, node.x!, node.y!)
            }}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const fontSize = 12
              ctx.font = `${fontSize}px Sans-Serif`
              const textWidth = ctx.measureText(node.name).width
              const bckgDimensions = [textWidth, fontSize].map((s) => s + fontSize * 0.4)
              const r = Math.max(...bckgDimensions) / 2
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
              ctx.fill()
            }}
            width={800}
            height={600}
            cooldownTicks={100}
            onEngineStop={() => fgRef.current?.zoomToFit(400)}
          />
        </CardContent>
      </Card>
      <div className="flex gap-4 text-sm text-muted-foreground">
        {Object.entries(relationshipColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx route for graph**

Replace graph route placeholder with `<Route path="graph" element={<GraphPage />} />`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/GraphPage.tsx web/src/App.tsx
git commit -m "feat: network graph visualization with force-directed layout"
```

---

## Task 10: Final App.tsx + Dark Mode

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/layouts/AppLayout.tsx`

- [ ] **Step 1: Add dark mode toggle to AppLayout**

Add a theme toggle button in the sidebar header of `web/src/layouts/AppLayout.tsx`:

```tsx
import { Moon, Sun } from 'lucide-react'

// Inside the component, add state:
const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

const toggleTheme = () => {
  const next = !dark
  setDark(next)
  document.documentElement.classList.toggle('dark', next)
  localStorage.setItem('theme', next ? 'dark' : 'light')
}

// Add in sidebar header area, next to the title:
<Button variant="ghost" size="icon" onClick={toggleTheme}>
  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
</Button>
```

Also add theme initialization to `web/src/main.tsx`:
```tsx
const theme = localStorage.getItem('theme')
if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
}
```

- [ ] **Step 2: Finalize App.tsx with all imports**

Make sure `App.tsx` imports all page components and maps routes correctly.

- [ ] **Step 3: Build and verify**

Run: `cd web && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web/src/
git commit -m "feat: dark mode toggle and finalize all routes"
```

---

## Self-Review

**Spec coverage:**
- [x] Auth (login/register) → Task 3
- [x] Dashboard with stats → Task 5
- [x] Contact list + detail → Task 6
- [x] Tags CRUD → Task 7
- [x] Reminders with status filter → Task 8
- [x] Network graph → Task 9
- [x] Dark mode → Task 10
- [x] Layout + routing → Task 4
- [x] Types + API client → Task 2
- [x] Project scaffold → Task 1

**Placeholder scan:** No TBD/TODO found. All code is complete.

**Type consistency:** All types defined in `types/index.ts` are used consistently across API modules, stores, and pages.
