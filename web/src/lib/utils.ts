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
