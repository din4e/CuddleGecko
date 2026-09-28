import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * isoToLocalInput converts a UTC ISO string to the `YYYY-MM-DDTHH:mm` value a
 * datetime-local input expects (interpreted as LOCAL time). Naively slicing
 * the ISO string (`iso.slice(0,16)`) hands the UTC wall-clock to the input,
 * which then reinterprets it as local on save — shifting the value by the
 * UTC offset on every edit round-trip (8h for UTC+8 users).
 */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/**
 * localDateInput returns today's (or the given date's) LOCAL calendar date as
 * `YYYY-MM-DD`. `new Date().toISOString().slice(0, 10)` yields the UTC date,
 * which is yesterday for UTC+8 users between 00:00 and 08:00 local.
 */
export function localDateInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * formatMoney renders CNY amounts the finance-web way: >=1万 collapses to a
 * compact `x.x万`, smaller values keep zh-CN thousand separators. Sub-万
 * values round to integers (finance-web behavior). Callers prefix ¥.
 */
export function formatMoney(v: number): string {
  if (Math.abs(v) >= 10000) {
    return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  }
  return Math.round(v).toLocaleString('zh-CN')
}

/**
 * lastDayOfMonth returns the LAST calendar day ("YYYY-MM-DD") of the given
 * "YYYY" year and "01".."12" month via a plain day-count table — no Date math,
 * no timezone round-trips. The backend treats a wire `to` as an inclusive end
 * date (advanced one day internally), so month spans must send the last day,
 * not first-of-next-month.
 */
export function lastDayOfMonth(year: string, month: string): string {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const y = Number(year)
  const m = Number(month)
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const last = m === 2 && leap ? 29 : days[m - 1]
  return `${year}-${month}-${String(last).padStart(2, '0')}`
}
