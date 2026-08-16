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

interface TimerState {
  phase: PomodoroPhase
  secondsLeft: number
  running: boolean
  completed: number
}

const IDLE: TimerState = {
  phase: 'idle',
  secondsLeft: POMODORO_WORK_SECONDS,
  running: false,
  completed: 0,
}

/**
 * advance performs the phase transition: work → break (counting the completed
 * session), break → work. Pure — given the same state it returns the same
 * result, so React StrictMode's double-invocation of updaters is harmless.
 */
function advance(st: TimerState): TimerState {
  if (st.phase === 'work') {
    return { ...st, phase: 'break', secondsLeft: POMODORO_BREAK_SECONDS, completed: st.completed + 1 }
  }
  return { ...st, phase: 'work', secondsLeft: POMODORO_WORK_SECONDS }
}

/**
 * tick is the pure per-second update: decrement while time remains, transition
 * when the countdown reaches zero. Effectively idempotent per input.
 */
function tick(st: TimerState): TimerState {
  if (!st.running) return st
  if (st.secondsLeft > 1) return { ...st, secondsLeft: st.secondsLeft - 1 }
  return advance(st)
}

/**
 * usePomodoro runs a classic Pomodoro timer (25-min focus → 5-min break,
 * auto-looping). onWorkComplete fires when a focus session finishes (the caller
 * persists the count). All transitions live in pure updaters over a single
 * state object — no effect-driven setState, and StrictMode-safe by construction.
 */
export function usePomodoro(onWorkComplete?: () => void): UsePomodoro {
  const [timer, setTimer] = useState<TimerState>(IDLE)

  // Latest-ref for the callback, kept current inside an effect (the canonical
  // "latest ref" pattern — writing refs during render is disallowed).
  const cbRef = useRef(onWorkComplete)
  useEffect(() => {
    cbRef.current = onWorkComplete
  }, [onWorkComplete])

  // Fire onWorkComplete when `completed` increments (side effects belong in
  // effects, not in state updaters — keeps tick pure).
  const prevCompleted = useRef(0)
  useEffect(() => {
    if (timer.completed > prevCompleted.current) {
      prevCompleted.current = timer.completed
      cbRef.current?.()
    }
  }, [timer.completed])

  useEffect(() => {
    if (!timer.running) return
    const t = setInterval(() => setTimer(tick), 1000)
    return () => clearInterval(t)
  }, [timer.running])

  const start = useCallback(() => {
    setTimer((st) => (st.phase === 'idle' ? { ...st, phase: 'work', running: true } : { ...st, running: true }))
  }, [])
  const pause = useCallback(() => setTimer((st) => ({ ...st, running: false })), [])
  const reset = useCallback(() => setTimer(IDLE), [])
  // Skip transitions immediately (paused or running), matching the previous
  // effect-driven behavior where reaching 0 advanced the phase at once.
  const skip = useCallback(() => setTimer(advance), [])

  return {
    phase: timer.phase,
    secondsLeft: timer.secondsLeft,
    running: timer.running,
    completed: timer.completed,
    start,
    pause,
    reset,
    skip,
  }
}

export function formatPomodoroTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
