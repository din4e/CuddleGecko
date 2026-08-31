import { describe, expect, it } from 'vitest'
import { buildTodoTree, buildLazyTree, descendantIds, subtreeAllDoneFromMap, type LazyChildrenSlice } from '../buildTodoTree'
import type { Todo } from '../../types'

function t(id: number, parent: number | null = null, sort = 0, over: Partial<Todo> = {}): Todo {
  return {
    id, user_id: 1, workspace_id: 1, title: `t${id}`, description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    parent_id: parent, sort_order: sort, child_count: 0, created_at: '', updated_at: '',
    ...over,
  }
}

const slice = (items: Todo[], hasMore = false): LazyChildrenSlice => ({ items, loaded: true, hasMore })

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

describe('buildLazyTree hideDone', () => {
  const done = { status: 'done' as const, completed_at: '2026-05-01' }

  it('marks nothing hidden when hideDone is off', () => {
    const root = t(1)
    const tree = buildLazyTree([root], new Map([[1, slice([t(2, 1, 0, done)])]]))
    expect(tree[0].hidden).toBeFalsy()
    expect(tree[0].children[0].hidden).toBeFalsy()
  })

  it('marks a settled done node hidden — the whole done branch at once', () => {
    // 1(pending) → 2(done) → 3(done): both done nodes are settled.
    const root = t(1)
    const tree = buildLazyTree(
      [root],
      new Map([
        [1, slice([t(2, 1, 0, done)])],
        [2, slice([t(3, 2, 0, done)])],
      ]),
      { hideDone: true },
    )
    const doneChild = tree[0].children[0]
    expect(doneChild.hidden).toBe(true)
    expect(doneChild.children[0].hidden).toBe(true)
    expect(tree[0].hidden).toBeFalsy()
  })

  it('keeps a done node with an open descendant visible', () => {
    // 1(pending) → 2(done) → 3(pending): hiding 2 would swallow 3.
    const root = t(1)
    const tree = buildLazyTree(
      [root],
      new Map([
        [1, slice([t(2, 1, 0, done)])],
        [2, slice([t(3, 2)])],
      ]),
      { hideDone: true },
    )
    expect(tree[0].children[0].hidden).toBeFalsy()
  })

  it('keeps a done node whose children are unloaded or truncated', () => {
    const root = t(1)
    // No slice for the done child (child_count 2, unfetched) → unknown.
    const unloaded = buildLazyTree(
      [root],
      new Map([[1, slice([t(2, 1, 0, { ...done, child_count: 2 })])]]),
      { hideDone: true },
    )
    expect(unloaded[0].children[0].hidden).toBeFalsy()
    // Slice truncated (hasMore) → more descendants may be pending.
    const truncated = buildLazyTree(
      [root],
      new Map([[1, slice([t(3, 1, 0, { ...done, child_count: 2 })], true)]]),
      { hideDone: true },
    )
    expect(truncated[0].children[0].hidden).toBeFalsy()
  })
})

describe('subtreeAllDoneFromMap', () => {
  it('is true only when the whole loaded subtree is done and nothing is unloaded', () => {
    const m = new Map<number, Todo[]>([
      [1, [t(2, 1, 0, { status: 'done', completed_at: '2026-05-01' })]],
    ])
    expect(subtreeAllDoneFromMap(t(1, null, 0, { child_count: 1 }), m)).toBe(true)
    expect(subtreeAllDoneFromMap(t(1, null, 0, { child_count: 2 }), m)).toBe(false) // one child unfetched
    expect(subtreeAllDoneFromMap(t(9), m)).toBe(true) // childless leaf
  })

  it('is false when any loaded descendant is open', () => {
    const m = new Map<number, Todo[]>([
      [1, [t(2, 1, 0, { status: 'done', completed_at: '2026-05-01' })]],
      [2, [t(3, 2)]],
    ])
    expect(subtreeAllDoneFromMap(t(1, null, 0, { child_count: 1 }), m)).toBe(false)
  })
})
