import { describe, it, expect } from 'vitest'
import { dueLabelParts, formatDueLabel } from '../dueLabel'

const now = new Date('2026-08-26T10:00:00')

describe('dueLabelParts', () => {
  it('classifies today with a clock time', () => {
    const p = dueLabelParts(new Date('2026-08-26T14:30:00'), now)
    expect(p.kind).toBe('today')
    expect(p.time).toBe('14:30')
  })

  it('today at midnight has no clock time', () => {
    const p = dueLabelParts(new Date('2026-08-26T00:00:00'), now)
    expect(p.kind).toBe('today')
    expect(p.time).toBeUndefined()
  })

  it('classifies tomorrow and the day after', () => {
    expect(dueLabelParts(new Date('2026-08-27T09:00:00'), now).kind).toBe('tomorrow')
    expect(dueLabelParts(new Date('2026-08-28T09:00:00'), now).kind).toBe('dayAfter')
  })

  it('groups the rest of the week as weekday', () => {
    // 2026-08-26 is a Wednesday; +3 → Saturday
    expect(dueLabelParts(new Date('2026-08-29T09:00:00'), now).kind).toBe('thisWeek')
    // +7 → next Wednesday: still within "this week" bucket (≤ 7 days)
    expect(dueLabelParts(new Date('2026-09-02T09:00:00'), now).kind).toBe('thisWeek')
    // +8 → beyond a week
    expect(dueLabelParts(new Date('2026-09-03T09:00:00'), now).kind).toBe('later')
  })

  it('counts overdue days across month boundaries', () => {
    // now: Aug 26 → due Aug 20 = 6 days overdue
    expect(dueLabelParts(new Date('2026-08-20T23:00:00'), now)).toMatchObject({
      kind: 'overdue',
      overdueDays: 6,
    })
  })

  it('later dates in another year keep the year', () => {
    const p = dueLabelParts(new Date('2027-01-05T09:00:00'), now)
    expect(p.kind).toBe('later')
  })
})

describe('formatDueLabel', () => {
  const t = (key: string, opts?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      'todos.today': '今天',
      'todos.tomorrow': '明天',
      'todos.dayAfterTomorrow': '后天',
      'todos.yesterday': '昨天',
    }
    if (key === 'todos.overdueDays') return `已逾期 ${opts?.n} 天`
    return map[key] ?? key
  }

  it('renders 今天 with time', () => {
    expect(formatDueLabel('2026-08-26T14:30:00', now, t)).toBe('今天 14:30')
  })

  it('renders tomorrow / day after tomorrow', () => {
    expect(formatDueLabel('2026-08-27T00:00:00', now, t)).toBe('明天')
    expect(formatDueLabel('2026-08-28T08:00:00', now, t)).toBe('后天 08:00')
  })

  it('renders overdue counts', () => {
    expect(formatDueLabel('2026-08-25T12:00:00', now, t)).toBe('昨天')
    expect(formatDueLabel('2026-08-22T12:00:00', now, t)).toBe('已逾期 4 天 12:00')
  })
})
