import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CountdownAlertKind, CountdownItem } from '../lib/countdown'

export interface CountdownInput {
  label: string
  /** Target instant, UTC ISO. */
  target: string
  /** Minutes before the deadline for the early heads-up; 0 = off. */
  remindBeforeMin?: number
}

interface CountdownState {
  items: CountdownItem[]
  /** Global bar dismissed — timers keep running and toasts still fire. */
  barHidden: boolean
  add: (input: CountdownInput) => void
  update: (id: string, patch: Partial<Pick<CountdownItem, 'label' | 'target' | 'remindBeforeMin'>>) => void
  remove: (id: string) => void
  clearFinished: (now?: Date) => void
  setBarHidden: (v: boolean) => void
  markAlerted: (id: string, kind: CountdownAlertKind) => void
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `cd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Global countdowns are device-local (like pomodoro state): targets are
// absolute instants so they survive reloads, and zustand persist keeps them
// across sessions without a backend round-trip.
export const useCountdownStore = create<CountdownState>()(
  persist(
    (set) => ({
      items: [],
      barHidden: false,
      add: ({ label, target, remindBeforeMin = 0 }) =>
        set((s) => ({
          items: [
            ...s.items,
            {
              id: newId(),
              label,
              target,
              remindBeforeMin,
              createdAt: new Date().toISOString(),
              preFired: false,
              fired: false,
            },
          ],
        })),
      // Editing the target re-arms both alerts (it may now be in the future
      // again); editing only the lead re-arms the early heads-up.
      update: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => {
            if (it.id !== id) return it
            const targetChanged = patch.target !== undefined && patch.target !== it.target
            const leadChanged = patch.remindBeforeMin !== undefined && patch.remindBeforeMin !== it.remindBeforeMin
            return {
              ...it,
              ...patch,
              preFired: targetChanged || leadChanged ? false : it.preFired,
              fired: targetChanged ? false : it.fired,
            }
          }),
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
      clearFinished: (now = new Date()) =>
        set((s) => ({ items: s.items.filter((it) => new Date(it.target).getTime() > now.getTime()) })),
      setBarHidden: (v) => set({ barHidden: v }),
      markAlerted: (id, kind) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? (kind === 'pre' ? { ...it, preFired: true } : { ...it, fired: true }) : it,
          ),
        })),
    }),
    {
      name: 'countdowns',
      partialize: (s) => ({ items: s.items, barHidden: s.barHidden }),
    },
  ),
)
