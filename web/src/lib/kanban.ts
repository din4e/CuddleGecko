import type { Todo } from '../types'
import type { KanbanColumn } from '../api/settings'

/**
 * Kanban column predicates. A column is a saved filter over todos; dropping a
 * card onto a column applies the column's predicate to the todo (status /
 * priority / tag mutation). Card membership: first matching column wins, so a
 * card never appears twice.
 */

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'status-pending', label: 'pending', kind: 'status', value: 'pending' },
  { id: 'status-done', label: 'done', kind: 'status', value: 'done' },
]

export function matchesColumn(todo: Todo, col: KanbanColumn): boolean {
  switch (col.kind) {
    case 'status':
      return todo.status === col.value
    case 'priority':
      return todo.priority === col.value
    case 'tag':
      return (todo.tags ?? []).some((tg) => String(tg.id) === col.value || tg.name === col.value)
  }
  return false
}

/** Buckets todos into their first matching column; unmatched todos go to an
 *  overflow bucket so they stay reachable (rendered in a trailing "other"
 *  pseudo-column by the page). */
export function bucketByColumns(todos: Todo[], columns: KanbanColumn[]): { byColumn: Map<string, Todo[]>; unmatched: Todo[] } {
  const byColumn = new Map<string, Todo[]>(columns.map((c) => [c.id, []]))
  const unmatched: Todo[] = []
  for (const t of todos) {
    const col = columns.find((c) => matchesColumn(t, c))
    if (col) byColumn.get(col.id)!.push(t)
    else unmatched.push(t)
  }
  return { byColumn, unmatched }
}
