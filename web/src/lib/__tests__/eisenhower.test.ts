import { describe, expect, it } from 'vitest'
import { axisIsHigh, quadrantOf, quadrantOverrides } from '../eisenhower'

const todo = (importance: string, urgency: string) =>
  ({ importance, urgency }) as unknown as Parameters<typeof quadrantOf>[0]

describe('axisIsHigh', () => {
  it('normal and high count, low and none do not', () => {
    expect(axisIsHigh('high')).toBe(true)
    expect(axisIsHigh('normal')).toBe(true)
    expect(axisIsHigh('low')).toBe(false)
    expect(axisIsHigh('none')).toBe(false)
    expect(axisIsHigh(undefined)).toBe(false)
  })
})

describe('quadrantOf', () => {
  it('buckets by the normal/high threshold on both axes', () => {
    expect(quadrantOf(todo('high', 'high'))).toBe('q1')
    expect(quadrantOf(todo('normal', 'normal'))).toBe('q1')
    expect(quadrantOf(todo('high', 'none'))).toBe('q2')
    expect(quadrantOf(todo('normal', 'low'))).toBe('q2')
    expect(quadrantOf(todo('low', 'high'))).toBe('q3')
    expect(quadrantOf(todo('none', 'normal'))).toBe('q3')
    expect(quadrantOf(todo('none', 'none'))).toBe('q4')
    expect(quadrantOf(todo('low', 'low'))).toBe('q4')
  })
})

describe('quadrantOverrides', () => {
  it('returns nothing when the todo already fits the quadrant', () => {
    expect(quadrantOverrides(todo('high', 'normal'), 'q1')).toEqual({})
    expect(quadrantOverrides(todo('none', 'none'), 'q4')).toEqual({})
  })

  it('flips only the axis on the wrong side, landing on the minimal tier', () => {
    expect(quadrantOverrides(todo('none', 'none'), 'q1')).toEqual({
      importance: 'normal',
      urgency: 'normal',
    })
    expect(quadrantOverrides(todo('high', 'none'), 'q3')).toEqual({
      importance: 'none',
      urgency: 'normal',
    })
  })

  it('keeps a high tier when staying on the same side', () => {
    // Moving q1 → q2 only touches urgency; importance stays 高 untouched.
    expect(quadrantOverrides(todo('high', 'high'), 'q2')).toEqual({
      urgency: 'none',
    })
  })
})
