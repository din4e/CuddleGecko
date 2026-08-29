/**
 * Human-friendly due-date labels (TickTick-style): 今天 14:00 / 明天 /
 * 后天 / 周三 / 3月4日 / 已逾期 2 天 — instead of a raw locale date string.
 */

export type DueLabelKind =
  | 'overdue'      // before today (已逾期 n 天 / 昨天)
  | 'today'
  | 'tomorrow'
  | 'dayAfter'     // 后天
  | 'thisWeek'     // within the next 7 days → weekday name
  | 'later'        // beyond a week (or past-year) → 月日 [年]

export interface DueLabelParts {
  kind: DueLabelKind
  /** For 'overdue': calendar days overdue (1 = 昨天/今天凌晨前). */
  overdueDays?: number
  /** HH:mm when the due time carries a real clock time (≠ 00:00); else absent. */
  time?: string
  /** Date used for weekday / 月日 rendering. */
  date: Date
}

const MS_DAY = 86_400_000

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Pure classification — testable with an injected "now". */
export function dueLabelParts(due: Date, now: Date): DueLabelParts {
  const dayDiff = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / MS_DAY)
  const time =
    due.getHours() === 0 && due.getMinutes() === 0
      ? undefined
      : `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
  const parts = { time, date: due }

  if (dayDiff < 0) {
    return { ...parts, kind: 'overdue' as const, overdueDays: -dayDiff }
  }
  if (dayDiff === 0) return { ...parts, kind: 'today' as const }
  if (dayDiff === 1) return { ...parts, kind: 'tomorrow' as const }
  if (dayDiff === 2) return { ...parts, kind: 'dayAfter' as const }
  if (dayDiff <= 7) return { ...parts, kind: 'thisWeek' as const }
  return { ...parts, kind: 'later' as const }
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string

/**
 * Render a DueLabelParts into display text using the app's i18n keys
 * (todos.today / todos.tomorrow / todos.dayAfterTomorrow / todos.yesterday /
 * todos.overdueDays). Weekday and 月日 come from Intl with the user locale.
 */
export function formatDueLabel(
  dueISO: string,
  now: Date,
  t: TFunc,
): string {
  const p = dueLabelParts(new Date(dueISO), now)
  const time = p.time ? ` ${p.time}` : ''
  switch (p.kind) {
    case 'today':
      return p.time ? `${t('todos.today')} ${p.time}` : t('todos.today')
    case 'tomorrow':
      return `${t('todos.tomorrow')}${time}`
    case 'dayAfter':
      return `${t('todos.dayAfterTomorrow')}${time}`
    case 'thisWeek': {
      const wd = p.date.toLocaleDateString(undefined, { weekday: 'short' })
      return `${wd}${time}`
    }
    case 'later': {
      const sameYear = p.date.getFullYear() === now.getFullYear()
      const md = p.date.toLocaleDateString(undefined, {
        ...(sameYear ? {} : { year: 'numeric' }),
        month: 'short',
        day: 'numeric',
      })
      return `${md}${time}`
    }
    case 'overdue': {
      if (p.overdueDays === 1) return t('todos.yesterday')
      // Still show the clock time — rescheduling context matters when overdue.
      return `${t('todos.overdueDays', { n: p.overdueDays })}${time}`
    }
  }
}
