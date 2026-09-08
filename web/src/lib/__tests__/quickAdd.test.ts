import { describe, it, expect } from 'vitest'
import { parseQuickAdd } from '../quickAdd'

// Reference "now" = Monday 2024-01-01 09:00 local — fixed so weekday math is deterministic.
const NOW = new Date(2024, 0, 1, 9, 0, 0, 0)
const TUESDAY = new Date(2024, 0, 2, 0, 0, 0, 0)
const WEDNESDAY = new Date(2024, 0, 3, 0, 0, 0, 0)
const NEXT_MONDAY = new Date(2024, 0, 8, 0, 0, 0, 0)

function atStartOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Day-level due dates default to end of day (23:59), like the form's chips.
function atEndOfDay(d: Date) {
  const r = atStartOfDay(d)
  r.setHours(23, 59, 0, 0)
  return r
}

describe('parseQuickAdd — date parsing', () => {
  it('strips "tomorrow" and sets next day', () => {
    const { title, due } = parseQuickAdd('Buy milk tomorrow', NOW)
    expect(title).toBe('Buy milk')
    expect(due).toEqual(atEndOfDay(new Date(2024, 0, 2)))
  })

  it('parses "today"', () => {
    const { title, due } = parseQuickAdd('Call mom today', NOW)
    expect(title).toBe('Call mom')
    expect(due).toEqual(atEndOfDay(NOW))
  })

  it('parses Chinese 明天', () => {
    const { title, due } = parseQuickAdd('买牛奶 明天', NOW)
    expect(title).toBe('买牛奶')
    expect(due).toEqual(atEndOfDay(new Date(2024, 0, 2)))
  })

  it('parses Chinese 后天', () => {
    const { due } = parseQuickAdd('汇报 后天', NOW)
    expect(due).toEqual(atEndOfDay(new Date(2024, 0, 3)))
  })

  it('parses "next week"', () => {
    const { title, due } = parseQuickAdd('Review plan next week', NOW)
    expect(title).toBe('Review plan')
    expect(due).toEqual(atEndOfDay(new Date(2024, 0, 8)))
  })

  it('parses "in 3 days"', () => {
    const { due } = parseQuickAdd('ship feature in 3 days', NOW)
    expect(due).toEqual(atEndOfDay(new Date(2024, 0, 4)))
  })

  it('parses "5天后"', () => {
    const { due } = parseQuickAdd('交付 5天后', NOW)
    expect(due).toEqual(atEndOfDay(new Date(2024, 0, 6)))
  })

  it('parses English weekday → next occurrence', () => {
    const { due } = parseQuickAdd('standup tuesday', NOW)
    expect(due).toEqual(atEndOfDay(TUESDAY))
  })

  it('parses Chinese 周三', () => {
    const { due } = parseQuickAdd('开会 周三', NOW)
    expect(due).toEqual(atEndOfDay(WEDNESDAY))
  })

  it('parses Chinese 星期一 (same weekday → next week)', () => {
    const { due } = parseQuickAdd('复盘 星期一', NOW)
    expect(due).toEqual(atEndOfDay(NEXT_MONDAY))
  })
})

describe('parseQuickAdd — time parsing', () => {
  it('parses 5pm', () => {
    const { title, due } = parseQuickAdd('Dinner 5pm', NOW)
    expect(title).toBe('Dinner')
    expect(due).not.toBeNull()
    expect(due!.getHours()).toBe(17)
    expect(due!.getMinutes()).toBe(0)
  })

  it('parses 5:30pm', () => {
    const { due } = parseQuickAdd('Call 5:30pm', NOW)
    expect(due!.getHours()).toBe(17)
    expect(due!.getMinutes()).toBe(30)
  })

  it('parses 12am as midnight', () => {
    const { due } = parseQuickAdd('sleep 12am', NOW)
    expect(due!.getHours()).toBe(0)
  })

  it('parses 24h 17:00', () => {
    const { due } = parseQuickAdd('meet 17:00', NOW)
    expect(due!.getHours()).toBe(17)
    expect(due!.getMinutes()).toBe(0)
  })

  it('parses Chinese 下午5点', () => {
    const { due } = parseQuickAdd('下班 下午5点', NOW)
    expect(due!.getHours()).toBe(17)
  })

  it('parses Chinese 9点 as 09:00', () => {
    const { due } = parseQuickAdd('早会 9点', NOW)
    expect(due!.getHours()).toBe(9)
  })

  it('parses Chinese 下午5:30', () => {
    const { due } = parseQuickAdd('茶歇 下午5:30', NOW)
    expect(due!.getHours()).toBe(17)
    expect(due!.getMinutes()).toBe(30)
  })
})

describe('parseQuickAdd — combined date + time', () => {
  it('combines tomorrow + 5pm', () => {
    const { title, due } = parseQuickAdd('Buy milk tomorrow 5pm', NOW)
    expect(title).toBe('Buy milk')
    expect(due).toEqual(new Date(2024, 0, 2, 17, 0, 0, 0))
  })

  it('combines 明天 + 下午5点', () => {
    const { title, due } = parseQuickAdd('买牛奶 明天下午5点', NOW)
    expect(title).toBe('买牛奶')
    expect(due).toEqual(new Date(2024, 0, 2, 17, 0, 0, 0))
  })
})

describe('parseQuickAdd — priority parsing', () => {
  it('parses !high', () => {
    const { title, priority } = parseQuickAdd('Urgent !high', NOW)
    expect(title).toBe('Urgent')
    expect(priority).toBe('high')
  })

  it('parses !1 as high', () => {
    const { priority } = parseQuickAdd('task !1', NOW)
    expect(priority).toBe('high')
  })

  it('parses !med and !2 and !normal as normal', () => {
    expect(parseQuickAdd('a !med', NOW).priority).toBe('normal')
    expect(parseQuickAdd('a !2', NOW).priority).toBe('normal')
    expect(parseQuickAdd('a !normal', NOW).priority).toBe('normal')
    expect(parseQuickAdd('a !medium', NOW).priority).toBe('normal')
  })

  it('parses !low and !3 as low', () => {
    expect(parseQuickAdd('a !low', NOW).priority).toBe('low')
    expect(parseQuickAdd('a !3', NOW).priority).toBe('low')
  })

  it('does not set priority when absent', () => {
    const { priority } = parseQuickAdd('plain task', NOW)
    expect(priority).toBeUndefined()
  })

  it('combines date + time + priority', () => {
    const { title, due, priority } = parseQuickAdd('Buy milk !high tomorrow 5pm', NOW)
    expect(title).toBe('Buy milk')
    expect(priority).toBe('high')
    expect(due).toEqual(new Date(2024, 0, 2, 17, 0, 0, 0))
  })
})

describe('parseQuickAdd — tag parsing', () => {
  it('extracts a single #tag', () => {
    const { title, tags } = parseQuickAdd('Email her #work', NOW)
    expect(title).toBe('Email her')
    expect(tags).toEqual(['work'])
  })

  it('extracts multiple #tags', () => {
    const { tags } = parseQuickAdd('task #a #b #c', NOW)
    expect(tags).toEqual(['a', 'b', 'c'])
  })

  it('returns no tags when absent', () => {
    const { tags } = parseQuickAdd('plain task', NOW)
    expect(tags).toEqual([])
  })

  it('does not treat a lone "#" or "C#" as a tag', () => {
    const { tags, title } = parseQuickAdd('C# tips #', NOW)
    expect(tags).toEqual([])
    expect(title).toBe('C# tips #')
  })

  it('combines date + time + priority + tag', () => {
    const { title, due, priority, tags } = parseQuickAdd('Buy milk #work !high tomorrow 5pm', NOW)
    expect(title).toBe('Buy milk')
    expect(priority).toBe('high')
    expect(tags).toEqual(['work'])
    expect(due).toEqual(new Date(2024, 0, 2, 17, 0, 0, 0))
  })
})

describe('parseQuickAdd — no date/time', () => {
  it('returns full text as title with no due', () => {
    const { title, due } = parseQuickAdd('Just a plain task', NOW)
    expect(title).toBe('Just a plain task')
    expect(due).toBeNull()
  })

  it('does not treat numbers in the title as a date', () => {
    const { title, due } = parseQuickAdd('Buy 5 apples', NOW)
    expect(title).toBe('Buy 5 apples')
    expect(due).toBeNull()
  })
})

describe('parseQuickAdd — repeat parsing', () => {
  it('parses 每天 as daily', () => {
    const { title, repeat, repeatInterval } = parseQuickAdd('晨跑 每天', NOW)
    expect(title).toBe('晨跑')
    expect(repeat).toBe('daily')
    expect(repeatInterval).toBeUndefined()
  })

  it('parses 每2周 as weekly with interval 2', () => {
    const { title, repeat, repeatInterval } = parseQuickAdd('复盘 每2周', NOW)
    expect(title).toBe('复盘')
    expect(repeat).toBe('weekly')
    expect(repeatInterval).toBe(2)
  })

  it('parses 工作日 as weekdays', () => {
    const { repeat } = parseQuickAdd('通勤 工作日', NOW)
    expect(repeat).toBe('weekdays')
  })

  it('parses 每周三 as weekly anchored on next Wednesday', () => {
    const { title, repeat, due } = parseQuickAdd('例会 每周三', NOW)
    expect(title).toBe('例会')
    expect(repeat).toBe('weekly')
    expect(due).toEqual(atEndOfDay(WEDNESDAY))
  })

  it('parses every 3 days as daily with interval 3', () => {
    const { title, repeat, repeatInterval } = parseQuickAdd('water plants every 3 days', NOW)
    expect(title).toBe('water plants')
    expect(repeat).toBe('daily')
    expect(repeatInterval).toBe(3)
  })

  it('parses every monday as weekly anchored next Monday', () => {
    const { repeat, due } = parseQuickAdd('standup every monday', NOW)
    expect(repeat).toBe('weekly')
    expect(due).toEqual(atEndOfDay(NEXT_MONDAY))
  })

  it('does not treat a bare adjective like "Weekly" as a rule', () => {
    const { title, repeat } = parseQuickAdd('Weekly report ~30m', NOW)
    expect(title).toBe('Weekly report')
    expect(repeat).toBeUndefined()
  })

  it('combines 每天 + 9点: due today at 09:00', () => {
    const { repeat, due } = parseQuickAdd('晨跑 每天9点', NOW)
    expect(repeat).toBe('daily')
    expect(due).toEqual(new Date(2024, 0, 1, 9, 0, 0, 0))
  })
})

describe('parseQuickAdd — duration parsing', () => {
  it('parses ~30m as 30 minutes', () => {
    const { title, duration } = parseQuickAdd('deep work ~30m', NOW)
    expect(title).toBe('deep work')
    expect(duration).toBe(30)
  })

  it('parses ~1.5h as 90 minutes', () => {
    const { duration } = parseQuickAdd('session ~1.5h', NOW)
    expect(duration).toBe(90)
  })

  it('parses 30分钟', () => {
    const { title, duration } = parseQuickAdd('会议 30分钟', NOW)
    expect(title).toBe('会议')
    expect(duration).toBe(30)
  })

  it('parses 1小时 as 60 and 半小时 as 30', () => {
    expect(parseQuickAdd('a 1小时', NOW).duration).toBe(60)
    expect(parseQuickAdd('b 半小时', NOW).duration).toBe(30)
  })

  it('parses 持续45分钟 and "for 30 min"', () => {
    expect(parseQuickAdd('a 持续45分钟', NOW).duration).toBe(45)
    expect(parseQuickAdd('b for 30 min', NOW).duration).toBe(30)
  })

  it('combines repeat + time + duration + tag', () => {
    const { title, repeat, duration, due, tags } = parseQuickAdd('晨跑 每天9点 30分钟 #健康', NOW)
    expect(title).toBe('晨跑')
    expect(repeat).toBe('daily')
    expect(duration).toBe(30)
    expect(due).toEqual(new Date(2024, 0, 1, 9, 0, 0, 0))
    expect(tags).toEqual(['健康'])
  })
})
