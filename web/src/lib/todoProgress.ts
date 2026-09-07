/**
 * Cross-subtask progress roll-up: how many descendant todos are done vs total,
 * at any depth. The backend's item_total/item_done counts a todo's own
 * checklist items only — this complements it by summarizing sub-TODO
 * completion for parents (tree rows, cards, kanban).
 */

import type { Todo } from '../types'
import type { TodoNode } from './buildTodoTree'

export interface SubtreeProgress {
  done: number
  total: number
}

/** Display percent for a todo: a done task is always 100; otherwise the
 *  manually configured value. null = nothing to show (no bar). */
export function todoProgressPercent(todo: Pick<Todo, 'progress' | 'status'>): number | null {
  if (todo.status === 'done') return todo.progress != null ? 100 : null
  return todo.progress ?? null
}

/** Progress over a todo's descendants via a children map (flat views /
 *  drawer). Cycle-safe; grandchildren count through nested recursion. */
export function subtreeProgressFromMap(
  childrenByParent: Map<number, Todo[]>,
  rootId: number,
  seen: Set<number> = new Set(),
): SubtreeProgress {
  let done = 0
  let total = 0
  const walk = (parentId: number) => {
    if (seen.has(parentId)) return
    seen.add(parentId)
    for (const child of childrenByParent.get(parentId) ?? []) {
      total++
      if (child.status === 'done') done++
      walk(child.id)
    }
  }
  walk(rootId)
  return { done, total }
}

/** Progress over an already-built lazy-tree node (tree view). */
export function subtreeProgressFromNode(node: TodoNode): SubtreeProgress {
  let done = 0
  let total = 0
  const walk = (n: TodoNode) => {
    for (const child of n.children) {
      total++
      if (child.todo.status === 'done') done++
      walk(child)
    }
  }
  walk(node)
  return { done, total }
}
