import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UpcomingBirthdaysCard from '../UpcomingBirthdaysCard'
import type { UpcomingBirthday } from '../../types'

const mocks = vi.hoisted(() => ({
  birthdays: [] as UpcomingBirthday[],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { count?: number }) =>
      opts?.count !== undefined ? `${k}:${opts.count}` : k,
  }),
}))

vi.mock('../../hooks/api/useContacts', () => ({
  useUpcomingBirthdays: () => ({ data: mocks.birthdays, isPending: false }),
}))

function occ(partial: Partial<UpcomingBirthday>): UpcomingBirthday {
  return {
    contact: {
      id: 1, user_id: 1, name: '小明', nickname: '', avatar_emoji: '🐱', avatar_url: '',
      phones: [], emails: [], birthday: '1990-07-15T00:00:00Z', birthday_calendar: 'lunar',
      notes: '', relationship_labels: [], tags: [], created_at: '', updated_at: '',
    },
    next_birthday: '2026-08-27T00:00:00Z',
    days_until: 7,
    calendar: 'lunar',
    is_today: false,
    age_turning: 36,
    lunar_text: '七月十五',
    ...partial,
  }
}

describe('UpcomingBirthdaysCard', () => {
  beforeEach(() => {
    mocks.birthdays = []
  })

  it('renders nothing while pending or when no birthdays are in range', () => {
    const { container } = render(<MemoryRouter><UpcomingBirthdaysCard /></MemoryRouter>)
    expect(container.firstChild).toBeNull()
  })

  it('shows countdown, lunar text and the 农历 badge for lunar birthdays', () => {
    mocks.birthdays = [occ({})]
    render(<MemoryRouter><UpcomingBirthdaysCard /></MemoryRouter>)
    expect(screen.getByTestId('upcoming-birthdays')).toBeTruthy()
    expect(screen.getByText('小明')).toBeTruthy()
    expect(screen.getByText('农历')).toBeTruthy()
    expect(screen.getByText(/七月十五/)).toBeTruthy()
    expect(screen.getByText('contacts.birthdayInDays:7')).toBeTruthy()
    expect(screen.getByRole('link', { name: /小明/ })).toHaveProperty('href')
  })

  it('marks today birthdays and omits lunar text for solar ones', () => {
    mocks.birthdays = [
      occ({
        contact: Object.assign(occ({}).contact, { id: 2, name: '小红', birthday_calendar: 'solar' }),
        calendar: 'solar',
        is_today: true,
        days_until: 0,
        lunar_text: undefined,
      }),
    ]
    render(<MemoryRouter><UpcomingBirthdaysCard /></MemoryRouter>)
    expect(screen.getByText('contacts.birthdayToday')).toBeTruthy()
    expect(screen.queryByText('农历')).toBeNull()
  })
})
