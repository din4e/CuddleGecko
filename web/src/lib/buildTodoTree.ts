import type { Todo } from '../types'

export interface TodoNode {
  todo: Todo
  children: TodoNode[]
}

/**
 * buildTodoTree turns a flat todo list into a nested tree grouped by parent_id.
 *
 * - Roots are todos with null/undefined parent_id, OR whose parent is absent
 *   from the list (e.g. filtered out by a smart-list) — they surface at the top
 *   so a subtree never silently disappears.
 * - Siblings are ordered by sort_order (then id) for a stable outliner layout.
 *
 * Cycles in the data can't be created via the API (the backend rejects them),
 * and would simply leave the cyclic nodes unrendered (no infinite recursion),
 * since traversal only starts from roots.
 */
export function buildTodoTree(todos: Todo[]): TodoNode[] {
  const present = new Set(todos.map((t) => t.id))
  const byParent = new Map<number | null, Todo[]>()

  for (const t of todos) {
    const pid = t.parent_id ?? null
    // A parent missing from this list → treat as root so the child stays visible.
    const key = pid == null || !present.has(pid) ? null : pid
    const arr = byParent.get(key) ?? []
    arr.push(t)
    byParent.set(key, arr)
  }

  const build = (parent: number | null): TodoNode[] => {
    const arr = (byParent.get(parent) ?? []).slice()
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
    return arr.map((todo) => ({ todo, children: build(todo.id) }))
  }
  return build(null)
}

/** flattenTree depth-first; handy for keyboard nav / "select all in subtree". */
export function flattenTree(nodes: TodoNode[]): TodoNode[] {
  const out: TodoNode[] = []
  const walk = (ns: TodoNode[]) => {
    for (const n of ns) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/**
 * descendantIds returns the set of todo ids that are (transitive) children of
 * rootId, excluding rootId itself. Used to keep a parent picker from offering a
 * todo's own descendant as a new parent (which the backend would reject as a
 * cycle).
 */
export function descendantIds(todos: Todo[], rootId: number): Set<number> {
  const childrenOf = new Map<number, number[]>()
  for (const t of todos) {
    if (t.parent_id == null) continue
    const arr = childrenOf.get(t.parent_id) ?? []
    arr.push(t.id)
    childrenOf.set(t.parent_id, arr)
  }
  const out = new Set<number>()
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const child of childrenOf.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child)
        queue.push(child)
      }
    }
  }
  return out
}

