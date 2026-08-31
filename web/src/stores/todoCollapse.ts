import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Subtask fold state, shared by every surface that renders TodoSubtaskList
 *  (flat-view cards, kanban, detail drawer). Ids in the set have their child
 *  list folded; absent = expanded, which is the historical default — so the
 *  fold is purely opt-in, survives reloads, and stays in sync between a card
 *  and the drawer opened from it. Semantics intentionally mirror the tree
 *  view's todoTreeExpanded (also a persisted id set), but inverted because
 *  the flat views' default is fully expanded. */
interface TodoCollapseState {
  collapsed: Set<number>
  toggle: (id: number) => void
  /** Un-fold one id (no-op when already expanded). Used after a drop or a
   *  create lands a new child under a folded node so the result is visible. */
  reveal: (id: number) => void
}

export const useTodoCollapseStore = create<TodoCollapseState>()(
  persist(
    (set) => ({
      collapsed: new Set<number>(),
      toggle: (id) => set((s) => {
        const next = new Set(s.collapsed)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { collapsed: next }
      }),
      reveal: (id) => set((s) => {
        if (!s.collapsed.has(id)) return s
        const next = new Set(s.collapsed)
        next.delete(id)
        return { collapsed: next }
      }),
    }),
    {
      name: 'todo-subtask-collapsed',
      // Set<number> doesn't survive the default JSON storage — keep the
      // persisted shape a plain id array and rebuild the Set on rehydrate.
      // localStorage is feature-detected so non-DOM environments (vitest
      // component tests) get a no-op store instead of a crash.
      storage: {
        getItem: (name) => {
          const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(name)
          if (raw == null) return null
          const parsed = JSON.parse(raw) as { state?: { collapsed?: number[] }; version?: number }
          return { state: { collapsed: new Set<number>(parsed.state?.collapsed ?? []) }, version: parsed.version }
        },
        setItem: (name, value) => {
          if (typeof localStorage === 'undefined') return
          localStorage.setItem(name, JSON.stringify({
            state: { collapsed: [...value.state.collapsed] },
            version: value.version,
          }))
        },
        removeItem: (name) => {
          if (typeof localStorage !== 'undefined') localStorage.removeItem(name)
        },
      },
    },
  ),
)
