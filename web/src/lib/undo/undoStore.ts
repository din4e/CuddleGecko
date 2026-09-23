// The undo stack: plain data + lifecycle, no API knowledge. Recording and
// execution live in recorder.ts; this store only keeps the entries so any UI
// can subscribe to depth.
import { create } from 'zustand'

export interface UndoEntry {
  id: number
  label: { action: string; entity: string }
  /** Identity for merging consecutive edits of the same entity (auto-save). */
  mergeKey: string
  /** Thunks executed in order; each receives the previous ops' results. */
  ops: Array<(results: unknown[]) => Promise<unknown>>
  /** Query scopes to invalidate once every op succeeds. */
  scopes: string[]
  /** Push time — consecutive-update merging only looks at the newest entry. */
  at: number
}

interface UndoState {
  entries: UndoEntry[]
  /** True while an undo's inverse requests are in flight. */
  busy: boolean
  push: (entry: Omit<UndoEntry, 'id' | 'at'>) => void
  pop: () => UndoEntry | undefined
  clear: () => void
  setBusy: (busy: boolean) => void
}

const MAX_ENTRIES = 50
// Rapid successive saves of one entity (detail-drawer auto-save) collapse
// into a single undo that restores the state before the first save.
const MERGE_WINDOW_MS = 1500
let nextId = 1

export const useUndoStore = create<UndoState>((set, get) => ({
  entries: [],
  busy: false,

  push: (entry) =>
    set((state) => {
      const top = state.entries[state.entries.length - 1]
      const now = Date.now()
      if (top && top.mergeKey === entry.mergeKey && now - top.at < MERGE_WINDOW_MS) {
        // Keep the OLDER ops: undo must restore the pre-burst state.
        const merged: UndoEntry = { ...top, at: now }
        const entries = state.entries.slice(0, -1)
        entries.push(merged)
        return { entries }
      }
      const entries = [...state.entries, { ...entry, id: nextId++, at: now }]
      return { entries: entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries }
    }),

  pop: () => {
    const entries = get().entries
    const top = entries[entries.length - 1]
    if (top) set({ entries: entries.slice(0, -1) })
    return top
  },

  clear: () => set({ entries: [] }),
  setBusy: (busy) => set({ busy }),
}))
