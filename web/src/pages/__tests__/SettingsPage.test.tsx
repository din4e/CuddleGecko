import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from '../SettingsPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSession: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('../../api/settings', () => ({
  settingsApi: {
    getCaptcha: vi.fn().mockResolvedValue({ enabled: true, length: 4 }),
    updateCaptcha: vi.fn(),
    getSession: mocks.getSession,
    updateSession: mocks.updateSession,
    getNav: vi.fn().mockResolvedValue({ order: [], hidden: [] }),
    updateNav: vi.fn(),
    getDashboard: vi.fn(),
    updateDashboard: vi.fn(),
    getKanban: vi.fn().mockResolvedValue({ columns: [] }),
    updateKanban: vi.fn(),
    getGraph: vi.fn(),
    updateGraph: vi.fn(),
  },
}))

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
  setCachedToken: vi.fn(),
  refreshAccessToken: mocks.refresh,
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The page checks GitHub for updates on mount — keep tests offline.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  })

  it('loads the session lifetime into the security tab and applies saves immediately', async () => {
    mocks.getSession.mockResolvedValue({ ttl_hours: 24 })
    mocks.updateSession.mockResolvedValue({ ttl_hours: 168 })
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: 'settings.tabSecurity' }))
    const select = await screen.findByLabelText('settings.sessionTTL')
    expect((select as HTMLSelectElement).value).toBe('24')

    await user.selectOptions(select, '168')
    await user.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(mocks.updateSession).toHaveBeenCalledWith({ ttl_hours: 168 })
    })
    // Saving re-issues the access token so the new lifetime covers the
    // CURRENT session (no re-login).
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })
})
