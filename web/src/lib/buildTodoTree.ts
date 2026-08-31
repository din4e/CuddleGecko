import type { Todo } from '../types'

export interface TodoNode {
  todo: Todo
  children: TodoNode[]
  /** Lazy tree: this node's children slice is still being fetched. */
  childrenLoading?: boolean
  /** Lazy tree: the children slice is truncated — a per-node "load more"
   *  grows the page size (see useTodoChildrenMap). */
  childrenHasMore?: boolean
  /** hideDone: this done node's whole loaded subtree is done, so the row is
   *  hidden from render. children stay intact — progress chips and move
   *  targets keep operating on the real subtree. */
  hidden?: boolean
}

/** Structural slice shape produced by useTodoChildrenMap per expanded node. */
export interface LazyChildrenSlice {
  items: Todo[]
  loaded: boolean
  hasMore: boolean
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

/**
 * buildLazyTree assembles the lazy tree view: roots come from the roots_only
 * query, children from per-parent slices fetched on expand. Sibling order is
 * the server's (it applies the toolbar sort), so no client-side reordering.
 * A node whose slice is missing (not expanded / not yet fetched) simply has
 * no children here — the caret visibility comes from todo.child_count.
 *
 * opts.hideDone marks done nodes `hidden` (see TodoNode) — marking only, the
 * renderer decides. A done node with open or still-unloaded descendants is
 * kept visible: pending work never disappears with its completed parent.
 */
export function buildLazyTree(
  roots: Todo[],
  slices: Map<number, LazyChildrenSlice>,
  opts?: { hideDone?: boolean },
): TodoNode[] {
  // "Settled" = the node's whole loaded subtree is done AND nothing under it
  // is still unloaded or truncated, so hiding it can't swallow open work.
  const settled = (n: TodoNode): boolean =>
    n.children.every((c) => c.todo.status === 'done' && settled(c)) &&
    !n.childrenHasMore &&
    (n.todo.child_count ?? 0) <= n.children.length
  const hideDone = opts?.hideDone ?? false
  const build = (todo: Todo): TodoNode => {
    const slice = slices.get(todo.id)
    const node: TodoNode = {
      todo,
      children: (slice?.items ?? []).map(build),
      childrenLoading: slice != null && !slice.loaded,
      childrenHasMore: slice?.hasMore ?? false,
    }
    if (hideDone) node.hidden = todo.status === 'done' && settled(node)
    return node
  }
  return roots.map(build)
}

/** Map-based counterpart of buildLazyTree's "settled" rule for subtask lists
 * (flat-view cards): true when the todo's whole loaded subtree is done and
 * nothing under it is still unloaded — i.e. hiding the row can't swallow
 * open work. */
export function subtreeAllDoneFromMap(
  todo: Todo,
  childrenByParent: Map<number, Todo[]>,
  seen: Set<number> = new Set(),
): boolean {
  if (seen.has(todo.id)) return false // cycle in the map → unknown → keep visible
  seen.add(todo.id)
  const children = childrenByParent.get(todo.id)
  // No slice, or fewer loaded rows than the server says exist (unfetched /
  // truncated) → the rest could be open → keep the row visible.
  if ((todo.child_count ?? 0) > (children?.length ?? 0)) return false
  return (children ?? []).every(
    (c) => c.status === 'done' && subtreeAllDoneFromMap(c, childrenByParent, seen),
  )
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

