import { describe, it, expect } from 'vitest'
import { matchesColumn, bucketByColumns, DEFAULT_KANBAN_COLUMNS } from '../kanban'
import type { Todo } from '../../types'
import type { KanbanColumn } from '../../api/settings'

const base = (over: Partial<Todo> & { id: number }): Todo => ({
  title: 't', status: 'pending', priority: 'normal', due_time: null, amount: null,
  amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1,
  parent_id: null, sort_order: 0, completed_at: null, created_at: '', updated_at: '',
  ...over,
} as Todo)

describe('kanban column predicates', () => {
  const statusCol: KanbanColumn = { id: 'c1', label: '待办', kind: 'status', value: 'pending' }
  const prioCol: KanbanColumn = { id: 'c2', label: '高优', kind: 'priority', value: 'high' }
  const tagCol: KanbanColumn = { id: 'c3', label: '工作', kind: 'tag', value: '7' }
  const tagByNameCol: KanbanColumn = { id: 'c4', label: '工作', kind: 'tag', value: 'work' }

  it('matches status / priority / tag (by id or name)', () => {
    expect(matchesColumn(base({ id: 1 }), statusCol)).toBe(true)
    expect(matchesColumn(base({ id: 1, status: 'done' }), statusCol)).toBe(false)
    expect(matchesColumn(base({ id: 1, priority: 'high' }), prioCol)).toBe(true)
    expect(matchesColumn(base({ id: 1, tags: [{ id: 7, name: 'work', color: '' } as never] }), tagCol)).toBe(true)
    expect(matchesColumn(base({ id: 1, tags: [{ id: 9, name: 'work', color: '' } as never] }), tagByNameCol)).toBe(true) // by name fallback
    expect(matchesColumn(base({ id: 1 }), tagCol)).toBe(false)
  })

  it('buckets to the FIRST matching column and keeps unmatched reachable', () => {
    const cols = [prioCol, statusCol]
    const { byColumn, unmatched } = bucketByColumns([
      base({ id: 1, priority: 'high' }),                 // → prio (first match even though also pending)
      base({ id: 2 }),                                   // → status pending
      base({ id: 3, status: 'done' }),                   // → unmatched
    ], cols)
    expect(byColumn.get('c2')!.map((t) => t.id)).toEqual([1])
    expect(byColumn.get('c1')!.map((t) => t.id)).toEqual([2])
    expect(unmatched.map((t) => t.id)).toEqual([3])
  })

  it('default columns are the classic pending/done/abandoned board', () => {
    expect(DEFAULT_KANBAN_COLUMNS).toHaveLength(3)
    expect(DEFAULT_KANBAN_COLUMNS.every((c) => c.kind === 'status')).toBe(true)
    expect(DEFAULT_KANBAN_COLUMNS.map((c) => c.value)).toEqual(['pending', 'done', 'abandoned'])
  })
})
