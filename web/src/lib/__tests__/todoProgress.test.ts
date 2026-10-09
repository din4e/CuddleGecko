import { describe, it, expect } from 'vitest'
import { subtreeProgressFromMap, subtreeProgressFromNode, todoProgressPercent } from '../todoProgress'
import { buildLazyTree } from '../buildTodoTree'
import type { Todo } from '../../types'

const base = (over: Partial<Todo> & { id: string; title: string; parent_id: string | null }): Todo => ({
  status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '',
  contact_ids: [], color: '', description: '', user_id: '1', workspace_id: '1',
  completed_at: null, created_at: '', updated_at: '',
  ...over,
} as Todo)

const root = base({ id: '1', title: 'Root', parent_id: null })
const childDone = base({ id: '2', title: 'Child done', parent_id: '1', status: 'done' })
const childOpen = base({ id: '3', title: 'Child open', parent_id: '1' })
const grandDone = base({ id: '4', title: 'Grand done', parent_id: '2', status: 'done' })
const grandOpen = base({ id: '5', title: 'Grand open', parent_id: '3' })

const map = new Map<string, Todo[]>([
  ['1', [childDone, childOpen]],
  ['2', [grandDone]],
  ['3', [grandOpen]],
])

describe('todoProgressPercent', () => {
  it('shows the manual percent regardless of status', () => {
    // Closing a todo (done / abandoned) must keep the percent it had.
    expect(todoProgressPercent(base({ id: '10', title: 'P', parent_id: null, progress: 40, status: 'pending' }))).toBe(40)
    expect(todoProgressPercent(base({ id: '10', title: 'P', parent_id: null, progress: 40, status: 'done' }))).toBe(40)
    expect(todoProgressPercent(base({ id: '10', title: 'P', parent_id: null, progress: 40, status: 'abandoned' }))).toBe(40)
  })

  it('returns null when no percent is configured, whatever the status', () => {
    expect(todoProgressPercent(base({ id: '10', title: 'P', parent_id: null, status: 'pending' }))).toBeNull()
    expect(todoProgressPercent(base({ id: '10', title: 'P', parent_id: null, status: 'done' }))).toBeNull()
    expect(todoProgressPercent(base({ id: '10', title: 'P', parent_id: null, status: 'abandoned' }))).toBeNull()
  })
})

describe('subtreeProgressFromMap', () => {
  it('rolls up completion across all descendant depths', () => {
    // 2 done (child + grandchild) out of 4 descendants.
    expect(subtreeProgressFromMap(map, '1')).toEqual({ done: 2, total: 4 })
  })

  it('returns zero for a leaf todo', () => {
    expect(subtreeProgressFromMap(map, '5')).toEqual({ done: 0, total: 0 })
  })

  it('is cycle-safe', () => {
    const cyclic = new Map<string, Todo[]>([
      ['1', [childDone]],
      ['2', [base({ id: '1', title: 'Back to root', parent_id: '2' })]],
    ])
    // The cycle is cut (no infinite walk); the bogus back-edge node still
    // counts once as a child before the visited-set stops the recursion.
    expect(subtreeProgressFromMap(cyclic, '1')).toEqual({ done: 1, total: 2 })
  })
})

describe('subtreeProgressFromNode', () => {
  it('rolls up over built lazy-tree nodes', () => {
    const slice = (items: Todo[]) => ({ items, total: items.length, loaded: true, hasMore: false })
    const [node] = buildLazyTree([root], new Map([
      ['1', slice([childDone, childOpen])],
      ['2', slice([grandDone])],
      ['3', slice([grandOpen])],
    ]))
    expect(node).toBeTruthy()
    expect(subtreeProgressFromNode(node!)).toEqual({ done: 2, total: 4 })
  })
})
