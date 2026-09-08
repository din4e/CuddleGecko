import { describe, it, expect } from 'vitest'
import { formatDuration } from '../duration'

const t = (key: string, opts?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'todos.durationMinutes': `${opts?.n}分钟`,
    'todos.durationHours': `${opts?.n}小时`,
    'todos.durationHoursMinutes': `${opts?.h}小时${opts?.m}分`,
  }
  return map[key] ?? key
}

describe('formatDuration', () => {
  it('formats sub-hour minutes', () => {
    expect(formatDuration(30, t)).toBe('30分钟')
    expect(formatDuration(45, t)).toBe('45分钟')
  })

  it('formats whole hours', () => {
    expect(formatDuration(60, t)).toBe('1小时')
    expect(formatDuration(120, t)).toBe('2小时')
  })

  it('formats mixed hours + minutes', () => {
    expect(formatDuration(90, t)).toBe('1小时30分')
  })

  it('returns empty for zero/negative/NaN', () => {
    expect(formatDuration(0, t)).toBe('')
    expect(formatDuration(-5, t)).toBe('')
    expect(formatDuration(Number.NaN, t)).toBe('')
  })
})
