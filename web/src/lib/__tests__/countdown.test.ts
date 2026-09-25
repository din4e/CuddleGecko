import { describe, it, expect } from 'vitest'
import {
  dueAlerts,
  formatCountdown,
  remainingSeconds,
  toLocalInputValue,
  upcoming,
  type CountdownItem,
} from '../countdown'

const NOW = new Date('2026-09-25T12:00:00Z')

function item(over: Partial<CountdownItem> = {}): CountdownItem {
  return {
    id: 'a',
    label: 'L',
    target: new Date(NOW.getTime() + 10 * 60_000).toISOString(), // 10 min out
    remindBeforeMin: 0,
    createdAt: NOW.toISOString(),
    preFired: false,
    fired: false,
    ...over,
  }
}

describe('remainingSeconds', () => {
  it('ceil-converts the gap to whole seconds', () => {
    const target = new Date(NOW.getTime() + 90_500).toISOString()
    expect(remainingSeconds(target, NOW)).toBe(91)
  })

  it('is negative once past the target', () => {
    expect(remainingSeconds(item({ target: new Date(NOW.getTime() - 1000).toISOString() }).target, NOW)).toBe(-1)
  })
})

describe('formatCountdown', () => {
  it('renders under an hour as mm:ss', () => {
    expect(formatCountdown(299)).toBe('04:59')
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('renders hours as h:mm:ss', () => {
    expect(formatCountdown(3_723)).toBe('1:02:03')
  })

  it('renders days via the i18n days label', () => {
    const t = (key: string, opts?: Record<string, unknown>) =>
      key === 'countdown.daysShort' ? `${opts?.n}天` : key
    expect(formatCountdown(2 * 86_400 + 5 * 3_600 + 12 * 60, t)).toBe('2天 05:12')
  })

  it('falls back to Nd without a t function and clamps negatives', () => {
    expect(formatCountdown(86_400 + 3_600)).toBe('1d 01:00')
    expect(formatCountdown(-5)).toBe('00:00')
  })
})

describe('dueAlerts', () => {
  it('fires the final alert once, then never again', () => {
    const past = item({ target: new Date(NOW.getTime() - 1_000).toISOString() })
    expect(dueAlerts([past], NOW)).toEqual([
      { id: 'a', label: 'L', target: past.target, kind: 'final' },
    ])
    expect(dueAlerts([{ ...past, fired: true }], NOW)).toEqual([])
  })

  it('fires the early heads-up only inside the lead window', () => {
    const withLead = item({ remindBeforeMin: 5 })
    // 10 min left > 5 min lead: nothing yet.
    expect(dueAlerts([withLead], NOW)).toEqual([])
    // 4 min left: heads-up due.
    const almost = item({ remindBeforeMin: 5, target: new Date(NOW.getTime() + 4 * 60_000).toISOString() })
    expect(dueAlerts([almost], NOW)).toEqual([
      { id: 'a', label: 'L', target: almost.target, kind: 'pre' },
    ])
    // Already fired: silent.
    expect(dueAlerts([{ ...almost, preFired: true }], NOW)).toEqual([])
  })

  it('skips the heads-up when the lead is off', () => {
    expect(dueAlerts([item({ remindBeforeMin: 0 })], NOW)).toEqual([])
  })
})

describe('upcoming', () => {
  it('keeps only future items, soonest first', () => {
    const soon = item({ id: 'soon', target: new Date(NOW.getTime() + 60_000).toISOString() })
    const later = item({ id: 'later', target: new Date(NOW.getTime() + 120_000).toISOString() })
    const past = item({ id: 'past', target: new Date(NOW.getTime() - 60_000).toISOString() })
    expect(upcoming([later, past, soon], NOW).map((it) => it.id)).toEqual(['soon', 'later'])
  })
})

describe('toLocalInputValue', () => {
  it('formats a Date as a local datetime-local value', () => {
    const d = new Date(2026, 8, 25, 14, 30) // local wall time
    expect(toLocalInputValue(d)).toMatch(/^2026-09-25T14:30$/)
  })
})
