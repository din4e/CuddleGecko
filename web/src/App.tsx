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
