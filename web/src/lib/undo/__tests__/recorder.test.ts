import { describe, it, expect } from 'vitest'
import { pickPending, makeFinders, type PendingMutation } from '../recorder'
import { classify } from '../inverse'

function pendingOf(variables: unknown, marker: string): PendingMutation {
  return { mutation: { marker }, variables, snapshot: [], at: Date.now() }
}

describe('pickPending (request ↔ mutation pairing)', () => {
  const ctxOf = (url: string) => classify('PUT', url)!

  it('pairs by id found in mutation variables (one level deep)', () => {
    const a = pendingOf({ id: 5, data: { title: 'x' } }, 'a')
    const b = pendingOf({ id: 9, data: { title: 'y' } }, 'b')
    const { chosen, rest } = pickPending([a, b], ctxOf('/todos/9'), { title: 'y' })
    expect((chosen?.mutation as { marker: string }).marker).toBe('b')
    expect(rest).toEqual([a])
  })

  it('looks inside nested variable objects (move parent_id)', () => {
    const a = pendingOf({ id: 1, parentId: 7, afterId: 2 }, 'a')
    const { chosen } = pickPending([a], ctxOf('/todos/7/move'), { parent_id: 7 })
    expect(chosen).toBe(a)
  })

  it('pairs a lone pending without id evidence (no ambiguity possible)', () => {
    const a = pendingOf({ title: 'new todo' }, 'a')
    const { chosen } = pickPending([a], ctxOf('/todos'), {})
    expect(chosen).toBe(a)
  })

  it('refuses to guess among several unmatched pendings', () => {
    const a = pendingOf({ title: 'one' }, 'a')
    const b = pendingOf({ title: 'two' }, 'b')
    const { chosen, rest } = pickPending([a, b], ctxOf('/todos'), {})
    expect(chosen).toBeNull()
    expect(rest.length).toBe(2)
  })

  it('bulk body ids pair with bulk variables', () => {
    const a = pendingOf({ ids: [1, 2, 3], action: 'complete' }, 'a')
    const { chosen } = pickPending([a], classify('POST', '/todos/bulk')!, { ids: [3, 4], action: 'complete' })
    expect(chosen).toBe(a)
  })
})

describe('makeFinders (snapshot lookups)', () => {
  // Shapes mirror the real cache: paged lists, infinite pages, plain arrays,
  // per-parent children slices and workout sets/exercises sub-lists.
  const snapshot = [
    [['todos', 'default', 'list', { sort: 'due_date' }], { items: [{ id: 1, title: 'root-a', parent_id: null }, { id: 2, title: 'child', parent_id: 5 }, { id: 3, title: 'root-b', parent_id: null }] }],
    [['todos', 'default', 'list', { sort: 'manual', parent_id: 5 }], { items: [{ id: 2, title: 'child', parent_id: 5 }] }],
    [['todos', 'default', 'list', { page: 2 }], { pages: [{ items: [{ id: 8, title: 'p2' }] }] }],
    [['todos', 'default', 'items', 5], [{ id: 11, content: 'a', sort_order: 1 }, { id: 12, content: 'b', sort_order: 2 }]],
    [['workouts', 'default', 'exercises', 5], [{ id: 21, name: 'squat' }]],
    [['workouts', 'default', 'sets', 5, 21], [{ id: 31, reps: 5 }]],
    [['whiteboards', 'default', 'board', 1], { id: 1, name: 'B', nodes: [{ id: 41, label: 'n' }], edges: [{ id: 51, from_node_id: 41, to_node_id: 41 }] }],
    [['contacts', 'default', 'list', {}], { items: [{ id: 61, name: 'C' }] }],
  ] as const

  const finders = makeFinders(snapshot)

  it('finds entities across list shapes and scopes', () => {
    expect(finders.entity(['todos'], 8)?.title).toBe('p2')
    expect(finders.entity(['todos'], 99)).toBeUndefined()
    expect(finders.entity(['contacts', 'reminders'], 61)?.name).toBe('C')
  })

  it('prevSibling groups by parent and prefers manual-order lists', () => {
    // id 1 in the due_date list: siblings = [1, 3] → 1 is first.
    expect(finders.prevSibling('todos', 1)).toBeNull()
    // id 3: previous sibling is 1.
    expect(finders.prevSibling('todos', 3)).toBe(1)
    // id 2 is a child of 5 — its sibling group only holds itself.
    expect(finders.prevSibling('todos', 2)).toBeNull()
    expect(finders.prevSibling('todos', 99)).toBeUndefined()
  })

  it('subList matches owned key paths of any depth', () => {
    expect(finders.subList('todos', 'items', [5])?.length).toBe(2)
    expect(finders.subList('workouts', 'sets', [5, 21])).toEqual([{ id: 31, reps: 5 }])
    expect(finders.subList('workouts', 'sets', [5, 99])).toBeUndefined()
  })

  it('boardLists reads nodes and edges off the board detail', () => {
    expect(finders.boardLists(1)?.nodes[0]?.id).toBe(41)
    expect(finders.boardLists(1)?.edges[0]?.id).toBe(51)
    expect(finders.boardLists(2)).toBeUndefined()
  })
})
