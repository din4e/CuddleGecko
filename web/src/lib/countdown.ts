/**
 * Global countdown: pure time math + alert scheduling. Targets are absolute
 * instants (UTC ISO), so they stay correct across reloads and never need a
 * ticking store — components compute remaining against a locally ticking
 * `now` (same isolation rule as PomodoroBar: no interval lives in the store).
 */

export interface CountdownItem {
  id: string
  label: string
  /** Target instant, UTC ISO. */
  target: string
  /** Minutes before the deadline for the early heads-up; 0 = off. */
  remindBeforeMin: number
  createdAt: string
  /** Early heads-up already fired (re-armed when target or lead is edited). */
  preFired: boolean
  /** Final time's-up alert already fired. */
  fired: boolean
}

export type CountdownAlertKind = 'pre' | 'final'

export interface CountdownAlert {
  id: string
  label: string
  target: string
  kind: CountdownAlertKind
}

export function remainingSeconds(target: string, now: Date): number {
  return Math.ceil((new Date(target).getTime() - now.getTime()) / 1000)
}

/** Alerts due at `now` and not yet fired — each fires exactly once. */
export function dueAlerts(items: CountdownItem[], now: Date): CountdownAlert[] {
  const out: CountdownAlert[] = []
  for (const it of items) {
    const remMs = new Date(it.target).getTime() - now.getTime()
    if (remMs <= 0) {
      if (!it.fired) out.push({ id: it.id, label: it.label, target: it.target, kind: 'final' })
    } else if (!it.preFired && it.remindBeforeMin > 0 && remMs <= it.remindBeforeMin * 60_000) {
      out.push({ id: it.id, label: it.label, target: it.target, kind: 'pre' })
    }
  }
  return out
}

/** Not-yet-finished items, soonest target first. */
export function upcoming(items: CountdownItem[], now: Date): CountdownItem[] {
  return items
    .filter((it) => new Date(it.target).getTime() > now.getTime())
    .sort((a, b) => new Date(a.target).getTime() - new Date(b.target).getTime())
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Compact countdown text: 04:59 / 1:02:03 / 2天 05:12. The multi-day label
 * goes through i18n (zh 天 / en d); without `t` it falls back to "2d".
 */
export function formatCountdown(totalSeconds: number, t?: TFunc): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3_600)
  const minutes = Math.floor((s % 3_600) / 60)
  const seconds = s % 60
  if (days > 0) {
    const daysLabel = t ? t('countdown.daysShort', { n: days }) : `${days}d`
    return `${daysLabel} ${pad2(hours)}:${pad2(minutes)}`
  }
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  return `${pad2(minutes)}:${pad2(seconds)}`
}

/** A Date as the local `YYYY-MM-DDTHH:mm` a datetime-local input expects. */
export function toLocalInputValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
