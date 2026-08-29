import { describe, it, expect } from 'vitest'
import {
  birthdayParts,
  isLunar,
  lunarFullText,
  lunarMonthDayText,
  nextBirthday,
} from '../lunar'

// Anchors verified against the lunar calendar (both lunar-javascript here and
// lunar-go on the backend agree):
//   lunar 1990-7-15 = solar 1990-09-03; lunar 7/15 in 2026 = 2026-08-27,
//   in 2027 = 2027-08-16; lunar 2026 month 7 has 29 days.

describe('birthdayParts', () => {
  it('parses the stored date from the ISO string (timezone-safe)', () => {
    expect(birthdayParts('1990-08-15T00:00:00Z')).toEqual({ y: 1990, m: 8, d: 15 })
    expect(birthdayParts('1990-08-15')).toEqual({ y: 1990, m: 8, d: 15 })
    expect(birthdayParts('not a date')).toBeNull()
  })
})

describe('isLunar', () => {
  it('only treats an explicit "lunar" as lunar', () => {
    expect(isLunar('lunar')).toBe(true)
    expect(isLunar('solar')).toBe(false)
    expect(isLunar(null)).toBe(false)
    expect(isLunar(undefined)).toBe(false)
  })
})

describe('nextBirthday', () => {
  it('finds the solar anniversary later this year', () => {
    const now = new Date(2026, 7, 20) // 2026-08-20
    const info = nextBirthday('1995-12-25T00:00:00Z', 'solar', now)
    expect(info?.date.getFullYear()).toBe(2026)
    expect(info?.date.getMonth()).toBe(11)
    expect(info?.date.getDate()).toBe(25)
    expect(info?.daysUntil).toBe(127)
    expect(info?.calendar).toBe('solar')
  })

  it('rolls to next year when the solar anniversary passed', () => {
    const now = new Date(2026, 7, 29) // 2026-08-29
    const info = nextBirthday('1995-03-15T00:00:00Z', 'solar', now)
    expect(info?.date.getFullYear()).toBe(2027)
    expect(info?.daysUntil).toBeGreaterThan(0)
  })

  it('treats today as the occurrence', () => {
    const now = new Date(2026, 7, 29)
    const info = nextBirthday('2000-08-29T00:00:00Z', 'solar', now)
    expect(info?.isToday).toBe(true)
    expect(info?.daysUntil).toBe(0)
  })

  it('clamps Feb 29 to Feb 28 in common years', () => {
    const info = nextBirthday('2000-02-29T00:00:00Z', 'solar', new Date(2027, 0, 10))
    expect(info?.date.getFullYear()).toBe(2027)
    expect(info?.date.getMonth()).toBe(1)
    expect(info?.date.getDate()).toBe(28)
  })

  it('converts lunar birthdays to this year\'s solar date', () => {
    const info = nextBirthday('1990-07-15T00:00:00Z', 'lunar', new Date(2026, 7, 20))
    expect(info?.date.getFullYear()).toBe(2026)
    expect(info?.date.getMonth()).toBe(7)
    expect(info?.date.getDate()).toBe(27)
    expect(info?.daysUntil).toBe(7)
    expect(info?.lunarText).toBe('七月十五')
  })

  it('rolls lunar birthdays to the next lunar year when passed', () => {
    const info = nextBirthday('1990-07-15T00:00:00Z', 'lunar', new Date(2026, 8, 15))
    expect(info?.date.getFullYear()).toBe(2027)
    expect(info?.date.getMonth()).toBe(7)
    expect(info?.date.getDate()).toBe(16)
  })

  it('clamps lunar 三十 to the last day of a 29-day month', () => {
    // Lunar 2026 month 7 has 29 days → 七月三十 celebrates on 廿九 (2026-09-10).
    const info = nextBirthday('1990-07-30T00:00:00Z', 'lunar', new Date(2026, 0, 1))
    expect(info?.date.getMonth()).toBe(8)
    expect(info?.date.getDate()).toBe(10)
  })

  it('returns null for unparseable birthdays', () => {
    expect(nextBirthday('', 'lunar')).toBeNull()
  })
})

describe('lunar text helpers', () => {
  it('renders month/day text', () => {
    expect(lunarMonthDayText(1, 1)).toBe('正月初一')
    expect(lunarMonthDayText(7, 15)).toBe('七月十五')
    expect(lunarMonthDayText(12, 30)).toBe('腊月三十')
  })

  it('renders the full lunar reading', () => {
    expect(lunarFullText('1990-07-15T00:00:00Z')).toBe('一九九〇年七月十五')
  })
})
