/**
 * Lunar (农历) birthday helpers — mirrors pkg/lunar on the backend (both use
 * 6tail's calendar libraries, so conversions agree).
 *
 * Storage convention: when birthday_calendar === 'lunar', the contact's
 * birthday Y/M/D are a lunar date; anniversaries convert to the Gregorian date
 * of the current lunar year.
 */
import { Lunar, LunarUtil, LunarYear } from 'lunar-javascript'

export type BirthdayCalendar = 'solar' | 'lunar'

export interface NextBirthdayInfo {
  /** Local midnight of the next Gregorian occurrence. */
  date: Date
  daysUntil: number
  isToday: boolean
  calendar: BirthdayCalendar
  /** Lunar month/day text for lunar birthdays, e.g. "七月十五". */
  lunarText?: string
}

export function isLunar(calendar: string | null | undefined): calendar is 'lunar' {
  return calendar === 'lunar'
}

/**
 * Extracts the stored Y/M/D from a birthday value. Parses the ISO string
 * directly: new Date() would shift the date for western timezones (the value
 * is date-only semantics serialized as UTC midnight).
 */
export function birthdayParts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }
}

function daysInSolarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Anniversary date in `year`; Feb 29 falls back to Feb 28 in common years. */
function solarAnniversary(year: number, month: number, day: number): Date {
  let d = day
  if (month === 2 && d === 29 && !isLeapYear(year)) d = 28
  if (d > daysInSolarMonth(year, month)) d = daysInSolarMonth(year, month)
  return new Date(year, month - 1, d)
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/** Days in a lunar month (29/30); falls back to 30 when unknown. */
function lunarMonthDays(year: number, month: number): number {
  const m = LunarYear.fromYear(year).getMonth(month)
  return m ? m.getDayCount() : 30
}

/**
 * Converts a lunar date to its Gregorian date in the given lunar year,
 * clamping 三十 to the last day of a 29-day month (matches the backend's
 * "过廿九" convention).
 */
function lunarToSolar(year: number, month: number, day: number): Date {
  const d = Math.min(day, lunarMonthDays(year, month))
  const solar = Lunar.fromYmd(year, month, d).getSolar()
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
}

function midnight(t: Date): Date {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

/** Next anniversary of a birthday (solar or lunar) at or after today. */
export function nextBirthday(
  birthday: string,
  calendar: string | null | undefined,
  now: Date = new Date(),
): NextBirthdayInfo | null {
  const parts = birthdayParts(birthday)
  if (!parts) return null

  const today = midnight(now)
  let date: Date
  if (isLunar(calendar)) {
    let year = today.getFullYear()
    // Bounded loop: worst case rolls into the next lunar year.
    for (let i = 0; i < 3; i++) {
      date = lunarToSolar(year, parts.m, parts.d)
      if (date.getTime() >= today.getTime()) break
      year++
    }
  } else {
    let year = today.getFullYear()
    for (let i = 0; i < 3; i++) {
      date = solarAnniversary(year, parts.m, parts.d)
      if (date.getTime() >= today.getTime()) break
      year++
    }
  }

  const daysUntil = Math.round((date!.getTime() - today.getTime()) / 86400000)
  return {
    date: date!,
    daysUntil,
    isToday: daysUntil === 0,
    calendar: isLunar(calendar) ? 'lunar' : 'solar',
    lunarText: isLunar(calendar) ? lunarMonthDayText(parts.m, parts.d) : undefined,
  }
}

/** "七月十五" / "腊月三十" for lunar month/day numbers (1-12, 1-30). */
export function lunarMonthDayText(month: number, day: number): string {
  const m = LunarUtil.MONTH[month] ?? String(month)
  const d = LunarUtil.DAY[day] ?? String(day)
  return `${m}月${d}`
}

/** Full lunar reading of a stored lunar birthday, e.g. "一九九〇年七月十五". */
export function lunarFullText(birthday: string): string | null {
  const parts = birthdayParts(birthday)
  if (!parts) return null
  const l = Lunar.fromYmd(parts.y, parts.m, Math.min(parts.d, lunarMonthDays(parts.y, parts.m)))
  return `${l.getYearInChinese()}年${l.getMonthInChinese()}月${l.getDayInChinese()}`
}

/** Gregorian date of the solar birthday a stored lunar birthday represents. */
export function lunarBirthdayToSolar(birthday: string): Date | null {
  const parts = birthdayParts(birthday)
  if (!parts) return null
  return lunarToSolar(parts.y, parts.m, parts.d)
}
