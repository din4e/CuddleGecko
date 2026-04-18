import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const ContactDetailPage = lazy(() => import('./pages/ContactDetailPage'))
const GraphPage = lazy(() => import('./pages/GraphPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const TagsPage = lazy(() => import('./pages/TagsPage'))
const RemindersPage = lazy(() => import('./pages/RemindersPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AIChatPage = lazy(() => import('./pages/AIChatPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[50vh]">
      <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  )
}

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
          <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
          <Route path="buddies" element={<Suspense fallback={<PageLoader />}><ContactsPage /></Suspense>} />
          <Route path="buddies/:id" element={<Suspense fallback={<PageLoader />}><ContactDetailPage /></Suspense>} />
          <Route path="graph" element={<Suspense fallback={<PageLoader />}><GraphPage /></Suspense>} />
          <Route path="events" element={<Suspense fallback={<PageLoader />}><EventsPage /></Suspense>} />
          <Route path="finance" element={<Suspense fallback={<PageLoader />}><FinancePage /></Suspense>} />
          <Route path="tags" element={<Suspense fallback={<PageLoader />}><TagsPage /></Suspense>} />
          <Route path="reminders" element={<Suspense fallback={<PageLoader />}><RemindersPage /></Suspense>} />
          <Route path="ai" element={<Suspense fallback={<PageLoader />}><AIChatPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
