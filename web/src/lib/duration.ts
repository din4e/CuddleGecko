/**
 * Estimated-effort (持续时长) formatting for todos: minutes → compact labels
 * like “45分钟” / “1小时30分” (zh) or “45m” / “1h30m” (en), a la TickTick.
 */

type TFunc = (key: string, opts?: Record<string, unknown>) => string

export function formatDuration(minutes: number, t: TFunc): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return t('todos.durationMinutes', { n: m })
  if (m === 0) return t('todos.durationHours', { n: h })
  return t('todos.durationHoursMinutes', { h, m })
}
