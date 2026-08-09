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

describe('parseQuickAdd — date parsing', () => {
  it('strips "tomorrow" and sets next day', () => {
    const { title, due } = parseQuickAdd('Buy milk tomorrow', NOW)
    expect(title).toBe('Buy milk')
    expect(due).toEqual(atStartOfDay(new Date(2024, 0, 2)))
  })

  it('parses "today"', () => {
    const { title, due } = parseQuickAdd('Call mom today', NOW)
    expect(title).toBe('Call mom')
    expect(due).toEqual(atStartOfDay(NOW))
  })

  it('parses Chinese 明天', () => {
    const { title, due } = parseQuickAdd('买牛奶 明天', NOW)
    expect(title).toBe('买牛奶')
    expect(due).toEqual(atStartOfDay(new Date(2024, 0, 2)))
  })

  it('parses Chinese 后天', () => {
    const { due } = parseQuickAdd('汇报 后天', NOW)
    expect(due).toEqual(atStartOfDay(new Date(2024, 0, 3)))
  })

  it('parses "next week"', () => {
    const { title, due } = parseQuickAdd('Review plan next week', NOW)
    expect(title).toBe('Review plan')
    expect(due).toEqual(atStartOfDay(new Date(2024, 0, 8)))
  })

  it('parses "in 3 days"', () => {
    const { due } = parseQuickAdd('ship feature in 3 days', NOW)
    expect(due).toEqual(atStartOfDay(new Date(2024, 0, 4)))
  })

  it('parses "5天后"', () => {
    const { due } = parseQuickAdd('交付 5天后', NOW)
    expect(due).toEqual(atStartOfDay(new Date(2024, 0, 6)))
  })

  it('parses English weekday → next occurrence', () => {
    const { due } = parseQuickAdd('standup tuesday', NOW)
    expect(due).toEqual(atStartOfDay(TUESDAY))
  })

  it('parses Chinese 周三', () => {
    const { due } = parseQuickAdd('开会 周三', NOW)
    expect(due).toEqual(atStartOfDay(WEDNESDAY))
  })

  it('parses Chinese 星期一 (same weekday → next week)', () => {
    const { due } = parseQuickAdd('复盘 星期一', NOW)
    expect(due).toEqual(atStartOfDay(NEXT_MONDAY))
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
