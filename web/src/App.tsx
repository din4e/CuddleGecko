import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import {
  loadAIChatPage,
  loadCalendarPage,
  loadContactDetailPage,
  loadContactsPage,
  loadDashboardPage,
  loadEventsPage,
  loadFinancePage,
  loadGraphPage,
  loadHabitsPage,
  loadPomodoroPage,
  loadRemindersPage,
  loadSettingsPage,
  loadTagsPage,
  loadTerminalPage,
  loadTodosPage,
} from './lib/pageLoaders'

const DashboardPage = lazy(loadDashboardPage)
const ContactsPage = lazy(loadContactsPage)
const ContactDetailPage = lazy(loadContactDetailPage)
const GraphPage = lazy(loadGraphPage)
const EventsPage = lazy(loadEventsPage)
const FinancePage = lazy(loadFinancePage)
const TagsPage = lazy(loadTagsPage)
const RemindersPage = lazy(loadRemindersPage)
const SettingsPage = lazy(loadSettingsPage)
const AIChatPage = lazy(loadAIChatPage)
const TodosPage = lazy(loadTodosPage)
const HabitsPage = lazy(loadHabitsPage)
const PomodoroPage = lazy(loadPomodoroPage)
const CalendarPage = lazy(loadCalendarPage)
const TerminalPage = lazy(loadTerminalPage)

function PageLoader() {
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="status" aria-live="polite">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span>Loading page</span>
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
          <Route path="todos" element={<Suspense fallback={<PageLoader />}><TodosPage /></Suspense>} />
          <Route path="habits" element={<Suspense fallback={<PageLoader />}><HabitsPage /></Suspense>} />
          <Route path="pomodoro" element={<Suspense fallback={<PageLoader />}><PomodoroPage /></Suspense>} />
          <Route path="calendar" element={<Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>} />
          <Route path="finance" element={<Suspense fallback={<PageLoader />}><FinancePage /></Suspense>} />
          <Route path="tags" element={<Suspense fallback={<PageLoader />}><TagsPage /></Suspense>} />
          <Route path="reminders" element={<Suspense fallback={<PageLoader />}><RemindersPage /></Suspense>} />
          <Route path="ai" element={<Suspense fallback={<PageLoader />}><AIChatPage /></Suspense>} />
          <Route path="terminal" element={<Suspense fallback={<PageLoader />}><TerminalPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
