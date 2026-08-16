import { create } from 'zustand'

export type PomodoroPhase = 'idle' | 'work' | 'break'

const WORK_SECONDS = 25 * 60
const BREAK_SECONDS = 5 * 60

interface PomodoroStore {
  phase: PomodoroPhase
  secondsLeft: number
  running: boolean
  completed: number
  focusTodoId: number | null
  focusTodoTitle: string | null
  intervalId: ReturnType<typeof setInterval> | null
  onComplete: (() => void) | null
  start: (todoId: number | null, todoTitle?: string) => void
  pause: () => void
  reset: () => void
  skip: () => void
  tick: () => void
  setOnComplete: (fn: (() => void) | null) => void
}

function clearTimer(id: ReturnType<typeof setInterval> | null) {
  if (id !== null) clearInterval(id)
}

export const usePomodoroStore = create<PomodoroStore>((set, get) => ({
  phase: 'idle',
  secondsLeft: WORK_SECONDS,
  running: false,
  completed: 0,
  focusTodoId: null,
  focusTodoTitle: null,
  intervalId: null,
  onComplete: null,

  start: (todoId, todoTitle) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    const wasIdle = get().phase === 'idle'
    set({
      phase: wasIdle ? 'work' : get().phase,
      secondsLeft: wasIdle ? WORK_SECONDS : get().secondsLeft,
      running: true,
      focusTodoId: todoId,
      focusTodoTitle: todoTitle ?? get().focusTodoTitle,
    })
    if (get().intervalId === null) {
      const id = setInterval(() => get().tick(), 1000)
      set({ intervalId: id })
    }
  },

  pause: () => {
    const { intervalId } = get()
    clearTimer(intervalId)
    set({ running: false, intervalId: null })
  },

  reset: () => {
    const { intervalId } = get()
    clearTimer(intervalId)
    set({
      phase: 'idle',
      secondsLeft: WORK_SECONDS,
      running: false,
      completed: 0,
      focusTodoId: null,
      focusTodoTitle: null,
      intervalId: null,
    })
  },

  // Skip forces the phase transition: zero the countdown first (tick() only
  // decrements by one when secondsLeft > 1, so calling it alone "skipped" a
  // single second, not the phase).
  skip: () => {
    set({ secondsLeft: 0 })
    get().tick()
  },

  tick: () => {
    const { secondsLeft, phase, onComplete } = get()
    if (secondsLeft > 1) {
      set({ secondsLeft: secondsLeft - 1 })
      return
    }
    // Transition at 0.
    if (phase === 'work') {
      set({ secondsLeft: BREAK_SECONDS, phase: 'break', completed: get().completed + 1 })
      onComplete?.()
    } else if (phase === 'break') {
      set({ secondsLeft: WORK_SECONDS, phase: 'work' })
    }
  },

  setOnComplete: (fn) => set({ onComplete: fn }),
}))

export function formatPomodoroTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
