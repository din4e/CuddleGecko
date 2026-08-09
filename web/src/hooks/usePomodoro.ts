import { useCallback, useEffect, useRef, useState } from 'react'

export type PomodoroPhase = 'idle' | 'work' | 'break'

export const POMODORO_WORK_SECONDS = 25 * 60
export const POMODORO_BREAK_SECONDS = 5 * 60

export interface UsePomodoro {
  phase: PomodoroPhase
  secondsLeft: number
  running: boolean
  /** work sessions completed since the timer was last reset */
  completed: number
  start: () => void
  pause: () => void
  reset: () => void
  skip: () => void
}

/**
 * usePomodoro runs a classic Pomodoro timer (25-min focus → 5-min break,
 * auto-looping). onWorkComplete fires when a focus session finishes (the caller
 * persists the count). Implemented as a pure-decrement tick + a separate
 * transition effect so React StrictMode (which double-invokes updaters) can't
 * double-count a completion.
 */
export function usePomodoro(onWorkComplete?: () => void): UsePomodoro {
  const [phase, setPhase] = useState<PomodoroPhase>('idle')
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_WORK_SECONDS)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(0)

  const cbRef = useRef(onWorkComplete)
  cbRef.current = onWorkComplete

  // Pure decrement (clamped at 0) — safe for StrictMode double-invocation.
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [running])

  // Transition when the countdown hits 0.
  useEffect(() => {
    if (secondsLeft !== 0) return
    if (phase === 'work') {
      setCompleted((c) => c + 1)
      cbRef.current?.()
      setPhase('break')
      setSecondsLeft(POMODORO_BREAK_SECONDS)
    } else if (phase === 'break') {
      setPhase('work')
      setSecondsLeft(POMODORO_WORK_SECONDS)
    }
  }, [secondsLeft, phase])

  const start = useCallback(() => {
    setPhase((p) => (p === 'idle' ? 'work' : p))
    setRunning(true)
  }, [])
  const pause = useCallback(() => setRunning(false), [])
  const reset = useCallback(() => {
    setRunning(false)
    setPhase('idle')
    setSecondsLeft(POMODORO_WORK_SECONDS)
  }, [])
  const skip = useCallback(() => setSecondsLeft(0), [])

  return { phase, secondsLeft, running, completed, start, pause, reset, skip }
}

export function formatPomodoroTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
