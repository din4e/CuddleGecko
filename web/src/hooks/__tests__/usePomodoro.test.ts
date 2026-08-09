import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePomodoro, POMODORO_WORK_SECONDS } from '../usePomodoro'

describe('usePomodoro', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('counts down a focus session and fires onWorkComplete', () => {
    const onWorkComplete = vi.fn()
    const { result } = renderHook(() => usePomodoro(onWorkComplete))

    expect(result.current.phase).toBe('idle')
    act(() => result.current.start())
    expect(result.current.phase).toBe('work')
    expect(result.current.running).toBe(true)

    // Run the whole 25-minute work duration.
    act(() => vi.advanceTimersByTime(POMODORO_WORK_SECONDS * 1000))

    expect(result.current.phase).toBe('break')
    expect(result.current.completed).toBe(1)
    expect(onWorkComplete).toHaveBeenCalledTimes(1)
  })

  it('pause stops the countdown', () => {
    const { result } = renderHook(() => usePomodoro())
    act(() => result.current.start())
    act(() => result.current.pause())
    expect(result.current.running).toBe(false)

    const before = result.current.secondsLeft
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.secondsLeft).toBe(before)
  })

  it('reset returns to idle', () => {
    const { result } = renderHook(() => usePomodoro())
    act(() => result.current.start())
    act(() => result.current.reset())
    expect(result.current.phase).toBe('idle')
    expect(result.current.running).toBe(false)
    expect(result.current.secondsLeft).toBe(POMODORO_WORK_SECONDS)
  })
})
