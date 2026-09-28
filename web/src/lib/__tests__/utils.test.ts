import { describe, expect, it } from 'vitest'
import { lastDayOfMonth } from '../utils'

// The backend treats a wire `to` as an inclusive end date, so month spans send
// the month's LAST day — the leap-year table is the only non-obvious logic.
describe('lastDayOfMonth', () => {
  it('returns 31-day months', () => {
    expect(lastDayOfMonth('2026', '01')).toBe('2026-01-31')
    expect(lastDayOfMonth('2026', '12')).toBe('2026-12-31')
  })

  it('returns 30-day months', () => {
    expect(lastDayOfMonth('2026', '04')).toBe('2026-04-30')
    expect(lastDayOfMonth('2026', '09')).toBe('2026-09-30')
  })

  it('handles February across leap rules', () => {
    expect(lastDayOfMonth('2026', '02')).toBe('2026-02-28') // common year
    expect(lastDayOfMonth('2024', '02')).toBe('2024-02-29') // divisible by 4
    expect(lastDayOfMonth('2000', '02')).toBe('2000-02-29') // divisible by 400
    expect(lastDayOfMonth('1900', '02')).toBe('1900-02-28') // divisible by 100, not 400
  })
})
