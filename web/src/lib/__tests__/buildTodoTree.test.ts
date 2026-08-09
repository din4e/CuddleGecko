import { describe, expect, it } from 'vitest'
import { buildTodoTree, descendantIds } from '../buildTodoTree'
import type { Todo } from '../../types'

function t(id: number, parent: number | null = null, sort = 0): Todo {
  return {
    id, user_id: 1, workspace_id: 1, title: `t${id}`, description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    parent_id: parent, sort_order: sort, created_at: '', updated_at: '',
  }
}

describe('buildTodoTree', () => {
  it('nests children under their parent_id', () => {
    const tree = buildTodoTree([t(1), t(2, 1), t(3, 1), t(4, 2)])
    expect(tree.map((n) => n.todo.id)).toEqual([1])
    expect(tree[0].children.map((n) => n.todo.id)).toEqual([2, 3])
    expect(tree[0].children[0].children.map((n) => n.todo.id)).toEqual([4])
  })

  it('surfaces children whose parent is absent (filtered out) as roots', () => {
    // parent 1 is not in the list → child 2 becomes a root instead of vanishing
    const tree = buildTodoTree([t(2, 1)])
    expect(tree.map((n) => n.todo.id)).toEqual([2])
    expect(tree[0].children).toHaveLength(0)
  })

  it('orders siblings by sort_order then id', () => {
    const tree = buildTodoTree([t(1), t(2, 1, 5), t(3, 1, 2), t(4, 1, 2)])
    expect(tree[0].children.map((n) => n.todo.id)).toEqual([3, 4, 2])
  })

  it('returns an empty array for an empty list', () => {
    expect(buildTodoTree([])).toEqual([])
  })
})

describe('descendantIds', () => {
  it('collects all transitive children, excluding the root', () => {
    const ids = descendantIds([t(1), t(2, 1), t(3, 2), t(4, 1), t(5)], 1)
    expect([...ids].sort()).toEqual([2, 3, 4])
  })

  it('returns an empty set for a leaf', () => {
    expect([...descendantIds([t(1), t(2, 1)], 2)]).toEqual([])
  })
})
