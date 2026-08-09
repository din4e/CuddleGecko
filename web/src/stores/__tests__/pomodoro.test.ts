import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePomodoroStore } from '../pomodoro'

describe('usePomodoroStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePomodoroStore.getState().reset()
  })
  afterEach(() => {
    usePomodoroStore.getState().reset()
    vi.useRealTimers()
  })

  it('starts in work phase with focus todo', () => {
    usePomodoroStore.getState().start(5, 'Write tests')
    const s = usePomodoroStore.getState()
    expect(s.phase).toBe('work')
    expect(s.running).toBe(true)
    expect(s.focusTodoId).toBe(5)
    expect(s.focusTodoTitle).toBe('Write tests')
    expect(s.secondsLeft).toBe(25 * 60)
  })

  it('ticks down over time', () => {
    usePomodoroStore.getState().start(1, 'task')
    vi.advanceTimersByTime(3000) // 3 seconds
    expect(usePomodoroStore.getState().secondsLeft).toBe(25 * 60 - 3)
  })

  it('transitions work→break at 0 and fires onComplete', () => {
    const onComplete = vi.fn()
    usePomodoroStore.getState().setOnComplete(onComplete)
    usePomodoroStore.getState().start(1, 'task')
    vi.advanceTimersByTime(25 * 60 * 1000) // full work duration

    const s = usePomodoroStore.getState()
    expect(s.phase).toBe('break')
    expect(s.completed).toBe(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(s.secondsLeft).toBe(5 * 60) // break duration
  })

  it('pause stops the countdown', () => {
    usePomodoroStore.getState().start(1, 'task')
    usePomodoroStore.getState().pause()
    expect(usePomodoroStore.getState().running).toBe(false)
    const before = usePomodoroStore.getState().secondsLeft
    vi.advanceTimersByTime(10000)
    expect(usePomodoroStore.getState().secondsLeft).toBe(before)
  })

  it('reset returns to idle and clears focus', () => {
    usePomodoroStore.getState().start(1, 'task')
    usePomodoroStore.getState().reset()
    const s = usePomodoroStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.running).toBe(false)
    expect(s.focusTodoId).toBe(null)
    expect(s.focusTodoTitle).toBe(null)
    expect(s.completed).toBe(0)
  })
})
