import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  isLoading: false,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh' },
  }),
}))

vi.mock('../../stores/auth', () => ({
  useAuthStore: (selector: (s: typeof authMocks) => unknown) => selector(authMocks),
}))

vi.mock('../../api/captcha', () => ({
  captchaApi: { get: vi.fn().mockResolvedValue({ data: { enabled: false } }) },
}))

function renderPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.isLoading = false
    authMocks.login.mockReset()
    localStorage.clear()
  })

  it('renders username, password and submit button', () => {
    renderPage()
    expect(screen.getByText('auth.username')).toBeInTheDocument()
    expect(screen.getByText('auth.password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'auth.signIn' })).toBeInTheDocument()
  })

  it('submits credentials on success', async () => {
    const user = userEvent.setup()
    authMocks.login.mockResolvedValue(undefined)
    renderPage()

    await user.type(screen.getByLabelText('auth.username'), 'alice')
    await user.type(screen.getByLabelText('auth.password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'auth.signIn' }))

    await waitFor(() => {
      expect(authMocks.login).toHaveBeenCalledWith('alice', 'secret123', undefined)
    })
  })

  it('shows an alert role on failure', async () => {
    const user = userEvent.setup()
    authMocks.login.mockRejectedValue(new Error('bad'))
    renderPage()

    await user.type(screen.getByLabelText('auth.username'), 'alice')
    await user.type(screen.getByLabelText('auth.password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'auth.signIn' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('auth.invalidCredentials')
    })
  })

  it('prefills remembered username and checks remember', () => {
    localStorage.setItem('remember_username', 'alice')
    renderPage()

    expect((screen.getByLabelText('auth.username') as HTMLInputElement).value).toBe('alice')
    expect(screen.getByLabelText('auth.rememberMe')).toBeChecked()
  })

  it('writes remembered username on submit when remember is on', async () => {
    const user = userEvent.setup()
    authMocks.login.mockResolvedValue(undefined)
    localStorage.setItem('remember_username', 'alice')
    renderPage()

    await user.click(screen.getByRole('button', { name: 'auth.signIn' }))

    await waitFor(() => {
      expect(localStorage.getItem('remember_username')).toBe('alice')
    })
  })

  it('does not persist username when remember is off', async () => {
    const user = userEvent.setup()
    authMocks.login.mockResolvedValue(undefined)
    renderPage()

    await user.type(screen.getByLabelText('auth.username'), 'bob')
    await user.click(screen.getByRole('button', { name: 'auth.signIn' }))

    await waitFor(() => {
      expect(localStorage.getItem('remember_username')).toBeNull()
    })
  })
})
