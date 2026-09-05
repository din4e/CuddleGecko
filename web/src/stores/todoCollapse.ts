import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Subtask fold state, scoped PER SURFACE (the timeline / grouped / manual
 *  flat views and the detail drawer each keep their own folds) so toggling a
 *  section on one page never leaks into another. Entries are `${scope}:${id}`
 *  strings; absent = expanded, the historical default — folds are opt-in and
 *  survive reloads. Semantics intentionally mirror the tree view's
 *  todoTreeExpanded (also a persisted id set), but inverted because the flat
 *  views' default is fully expanded. */
interface TodoCollapseState {
  collapsed: Set<string>
  toggle: (scope: string, id: number) => void
  /** Un-fold one id in EVERY scope (no-op when already expanded). Used after
   *  a drop or a create lands a new child under a folded node so the result
   *  is visible on whichever surface renders it. */
  reveal: (id: number) => void
}

/** Default scope for surfaces that don't name one. */
export const collapseKey = (scope: string, id: number) => `${scope}:${id}`

export const useTodoCollapseStore = create<TodoCollapseState>()(
  persist(
    (set) => ({
      collapsed: new Set<string>(),
      toggle: (scope, id) => set((s) => {
        const next = new Set(s.collapsed)
        const key = collapseKey(scope, id)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return { collapsed: next }
      }),
      reveal: (id) => set((s) => {
        const suffix = `:${id}`
        const next = new Set([...s.collapsed].filter((k) => !k.endsWith(suffix)))
        return next.size === s.collapsed.size ? s : { collapsed: next }
      }),
    }),
    {
      name: 'todo-subtask-collapsed',
      // The persisted shape is a plain key array (`"${scope}:${id}"`), rebuilt
      // into a Set on rehydrate. Legacy entries persisted as bare numbers by
      // the old global store can't map to a scope and are dropped once.
      // localStorage is feature-detected so non-DOM environments (vitest
      // component tests) get a no-op store instead of a crash.
      storage: {
        getItem: (name) => {
          const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(name)
          if (raw == null) return null
          const parsed = JSON.parse(raw) as { state?: { collapsed?: unknown[] }; version?: number }
          const collapsed = new Set<string>((parsed.state?.collapsed ?? []).filter((k): k is string => typeof k === 'string'))
          return { state: { collapsed }, version: parsed.version }
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
