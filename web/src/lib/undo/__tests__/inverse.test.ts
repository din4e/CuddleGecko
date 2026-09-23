import { describe, it, expect } from 'vitest'
import {
  classify,
  buildUndoPlan,
  EMPTY_FINDERS,
  type SnapshotFinders,
  type UndoMethod,
} from '../inverse'

type Entity = Record<string, unknown>

interface Fixture {
  entities: Record<number, Entity>
  prev: Record<number, number | null | undefined>
  subLists: Record<string, Entity[]>
  boards: Record<number, { nodes: Entity[]; edges: Entity[] }>
}

function makeFinders(fixture: Fixture): SnapshotFinders {
  return {
    entity: (_scopes, id) => fixture.entities[id],
    prevSibling: (_scope, id) => {
      const prev = fixture.prev[id]
      // null (was first) must stay distinct from missing (no cached order).
      return prev === undefined ? undefined : prev
    },
    subList: (_scope, kind, ownerIds) => fixture.subLists[`${kind}:${ownerIds.join('/')}`],
    boardLists: (id) => fixture.boards[id],
  }
}

function planFor(method: UndoMethod, url: string, opts: { fixture?: Fixture; data?: unknown; params?: unknown; result?: unknown } = {}) {
  const ctx = classify(method, url)
  if (!ctx) return { ctx: null, plan: null }
  return { ctx, plan: buildUndoPlan(ctx, { data: opts.data, params: opts.params, result: opts.result, finders: opts.fixture ? makeFinders(opts.fixture) : EMPTY_FINDERS }) }
}

const noFixture: Fixture = { entities: {}, prev: {}, subLists: {}, boards: {} }

describe('classify', () => {
  it('parses resource, ids and action tail', () => {
    const ctx = classify('PATCH', '/todos/5/items/9/toggle')
    expect(ctx).toMatchObject({ resource: 'todos', ids: [5, 9], tail: ['items', 'toggle'], scope: 'todos' })
  })

  it('rejects non-undoable resources', () => {
    expect(classify('POST', '/auth/login')).toBeNull()
    expect(classify('POST', '/ai/chat/sync')).toBeNull()
    expect(classify('PUT', '/settings/nav')).toBeNull()
    expect(classify('POST', '/workspaces')).toBeNull()
    expect(classify('POST', '/import/todos')).toBeNull()
  })
})

describe('create → delete', () => {
  it('builds a delete for the created id', () => {
    const { plan } = planFor('POST', '/buddies', { result: { id: 7, name: 'A' } })
    expect(plan?.ops).toEqual([{ method: 'DELETE', url: '/buddies/7' }])
    expect(plan?.label).toEqual({ action: 'create', entity: 'contacts' })
    expect(plan?.scopes).toContain('contacts')
  })

  it('requires an id in the result', () => {
    expect(planFor('POST', '/buddies', { result: undefined }).plan).toBeNull()
    expect(planFor('POST', '/buddies', { result: {} }).plan).toBeNull()
  })

  it('nested interaction create deletes via its own collection', () => {
    const { plan } = planFor('POST', '/buddies/3/interactions', { result: { id: 11 } })
    expect(plan?.ops).toEqual([{ method: 'DELETE', url: '/interactions/11' }])
  })

  it('todo duplicate removes the copy', () => {
    const { plan } = planFor('POST', '/todos/5/duplicate', { result: { id: 12 } })
    expect(plan?.ops).toEqual([{ method: 'DELETE', url: '/todos/12' }])
  })
})

describe('update → restore previous value', () => {
  it('sends the pre-state without server fields', () => {
    const { plan } = planFor('PUT', '/buddies/7', {
      data: { name: 'New' },
      fixture: { ...noFixture, entities: { 7: { id: 7, user_id: 1, name: 'Old', notes: 'n', tags: [{ id: 2 }], created_at: 'x' } } },
    })
    expect(plan?.ops[0]?.method).toBe('PUT')
    expect(plan?.ops[0]?.url).toBe('/buddies/7')
    expect(plan?.ops[0]?.data).toEqual({ name: 'Old', notes: 'n' })
  })

  it('todo payload carries clear flags for nulls', () => {
    const { plan } = planFor('PUT', '/todos/5', {
      data: { title: 'New' },
      fixture: { ...noFixture, entities: { 5: { id: 5, title: 'Old', status: 'pending', priority: 'high', due_time: null, start_time: null, amount: null, progress: null, contact_ids: [3] } } },
    })
    const data = plan?.ops[0]?.data as Entity
    expect(data.title).toBe('Old')
    expect(data.status).toBe('pending')
    expect(data.clear_due_time).toBe(true)
    expect(data.clear_progress).toBe(true)
    expect(data.due_time).toBe('')
  })

  it('skips when no pre-state is available', () => {
    expect(planFor('PUT', '/buddies/7', { data: { name: 'New' } }).plan).toBeNull()
  })
})

describe('delete → recreate / restore', () => {
  it('todo delete is undone by restore (id preserved)', () => {
    const { plan } = planFor('DELETE', '/todos/5')
    expect(plan?.ops).toEqual([{ method: 'POST', url: '/todos/5/restore' }])
    expect(plan?.label).toEqual({ action: 'delete', entity: 'todos' })
  })

  it('contact delete recreates and re-applies tags on the new id', () => {
    const { plan } = planFor('DELETE', '/buddies/7', {
      fixture: { ...noFixture, entities: { 7: { id: 7, name: 'A', phones: ['1'], tags: [{ id: 2 }, { id: 4 }] } } },
    })
    expect(plan?.ops.length).toBe(2)
    expect(plan?.ops[0]).toMatchObject({ method: 'POST', url: '/buddies' })
    expect(plan?.ops[0]?.data).toEqual({ name: 'A', phones: ['1'] })
    const urlFn = plan?.ops[1]?.url as (results: unknown[]) => string
    expect(urlFn([{ id: 99 }])).toBe('/buddies/99/tags')
    expect(plan?.ops[1]?.data).toEqual({ tag_ids: [2, 4] })
  })

  it('reminder delete recreates under its contact (nested create URL)', () => {
    const { plan } = planFor('DELETE', '/reminders/9', {
      fixture: { ...noFixture, entities: { 9: { id: 9, contact_id: 3, title: 'T', remind_at: '2026-01-01T00:00:00Z', status: 'pending' } } },
    })
    expect(plan?.ops[0]).toMatchObject({ method: 'POST', url: '/buddies/3/reminders' })
    expect(plan?.ops[0]?.data).toEqual({ title: 'T', remind_at: '2026-01-01T00:00:00Z', status: 'pending' })
  })

  it('skips delete-undo when the entity was not cached', () => {
    expect(planFor('DELETE', '/events/42').plan).toBeNull()
  })
})

describe('tag association', () => {
  it('restores the previous tag set from the pre-state entity', () => {
    const { plan } = planFor('PUT', '/todos/5/tags', {
      data: { tag_ids: [9] },
      fixture: { ...noFixture, entities: { 5: { id: 5, title: 'T', tags: [{ id: 2 }, { id: 3 }] } } },
    })
    expect(plan?.ops[0]?.data).toEqual({ tag_ids: [2, 3] })
  })

  it('skips without cached tags', () => {
    expect(planFor('PUT', '/todos/5/tags', { data: { tag_ids: [9] }, fixture: { ...noFixture, entities: { 5: { id: 5 } } } }).plan).toBeNull()
  })
})

describe('todo patch actions', () => {
  it('plain toggle is its own inverse', () => {
    const { plan } = planFor('PATCH', '/todos/5/toggle')
    expect(plan?.ops).toEqual([{ method: 'PATCH', url: '/todos/5/toggle' }])
  })

  it('recurring toggle restores the full todo (server advances due date)', () => {
    const { plan } = planFor('PATCH', '/todos/5/toggle', {
      fixture: { ...noFixture, entities: { 5: { id: 5, title: 'R', repeat: 'daily', due_time: '2026-01-01T00:00:00Z', status: 'pending' } } },
    })
    expect(plan?.ops[0]?.method).toBe('PUT')
    expect(plan?.ops[0]?.url).toBe('/todos/5')
    const data = plan?.ops[0]?.data as Entity
    expect(data.due_time).toBe('2026-01-01T00:00:00Z')
  })

  it('pin toggles back', () => {
    expect(planFor('PATCH', '/todos/5/pin').plan?.ops).toEqual([{ method: 'PATCH', url: '/todos/5/pin' }])
  })

  it('status restores the previous status', () => {
    const { plan } = planFor('PATCH', '/todos/5/status', {
      data: { status: 'done' },
      fixture: { ...noFixture, entities: { 5: { id: 5, status: 'pending' } } },
    })
    expect(plan?.ops[0]?.data).toEqual({ status: 'pending' })
    expect(planFor('PATCH', '/todos/5/status', { data: { status: 'done' } }).plan).toBeNull()
  })

  it('progress clears when it was unset', () => {
    const { plan } = planFor('PATCH', '/todos/5/progress', {
      data: { progress: 50 },
      fixture: { ...noFixture, entities: { 5: { id: 5, progress: null } } },
    })
    expect(plan?.ops[0]?.data).toEqual({ clear: true })
  })

  it('reorder moves back after the previous sibling', () => {
    const { plan } = planFor('PATCH', '/todos/5/reorder', {
      data: { after_id: 1 },
      fixture: { ...noFixture, prev: { 5: 2 } },
    })
    expect(plan?.ops[0]?.data).toEqual({ after_id: 2 })
    expect(planFor('PATCH', '/todos/5/reorder', { data: { after_id: 1 }, fixture: noFixture }).plan).toBeNull()
  })

  it('move restores parent and position', () => {
    const { plan } = planFor('PATCH', '/todos/5/move', {
      data: { parent_id: 8, after_id: null },
      fixture: { ...noFixture, entities: { 5: { id: 5, parent_id: 3 } }, prev: { 5: null } },
    })
    expect(plan?.ops[0]?.data).toEqual({ parent_id: 3, after_id: null })
  })
})

describe('todo bulk', () => {
  it('bulk delete restores each row', () => {
    const { plan } = planFor('POST', '/todos/bulk', { data: { ids: [1, 2], action: 'delete' } })
    expect(plan?.ops).toEqual([
      { method: 'POST', url: '/todos/1/restore' },
      { method: 'POST', url: '/todos/2/restore' },
    ])
  })

  it('bulk complete restores each pre-state, skipping undo if any is missing', () => {
    const fixture: Fixture = { ...noFixture, entities: { 1: { id: 1, title: 'A', status: 'done' }, 2: { id: 2, title: 'B', status: 'pending' } } }
    const { plan } = planFor('POST', '/todos/bulk', { data: { ids: [1, 2], action: 'complete' }, fixture })
    expect(plan?.ops.map((op) => op.method)).toEqual(['PUT', 'PUT'])
    expect((plan?.ops[0]?.data as Entity).status).toBe('done')

    const partial: Fixture = { ...noFixture, entities: { 1: { id: 1, title: 'A' } } }
    expect(planFor('POST', '/todos/bulk', { data: { ids: [1, 2], action: 'complete' }, fixture: partial }).plan).toBeNull()
  })
})

describe('todo checklist items', () => {
  const items: Entity[] = [{ id: 1, content: 'a', due_time: null }, { id: 2, content: 'b' }]
  const fixture: Fixture = { ...noFixture, subLists: { 'items:5': items } }

  it('create deletes the new item', () => {
    const { plan } = planFor('POST', '/todos/5/items', { result: { id: 3 }, fixture })
    expect(plan?.ops).toEqual([{ method: 'DELETE', url: '/todos/5/items/3' }])
  })

  it('update restores content and due flags', () => {
    const { plan } = planFor('PUT', '/todos/5/items/1', { data: { content: 'changed' }, fixture })
    expect(plan?.ops[0]?.data).toEqual({ content: 'a', due_time: '', clear_due_time: true })
  })

  it('delete recreates the item', () => {
    const { plan } = planFor('DELETE', '/todos/5/items/2', { fixture })
    expect(plan?.ops[0]).toMatchObject({ method: 'POST', url: '/todos/5/items' })
    expect(plan?.ops[0]?.data).toEqual({ content: 'b', due_time: '', clear_due_time: true })
  })

  it('toggle is its own inverse', () => {
    expect(planFor('PATCH', '/todos/5/items/2/toggle', { fixture }).plan?.ops).toEqual([{ method: 'PATCH', url: '/todos/5/items/2/toggle' }])
  })

  it('reorder returns to the previous slot', () => {
    const { plan } = planFor('PATCH', '/todos/5/items/2/reorder', { data: { after_id: null }, fixture })
    expect(plan?.ops[0]?.data).toEqual({ after_id: 1 })
  })

  it('promote removes the new todo and re-creates the item', () => {
    const { plan } = planFor('POST', '/todos/5/items/2/promote', { result: { id: 40 }, fixture })
    expect(plan?.ops).toEqual([
      { method: 'DELETE', url: '/todos/40' },
      { method: 'POST', url: '/todos/5/items', data: { content: 'b', due_time: '', clear_due_time: true } },
    ])
  })
})

describe('workouts', () => {
  it('workout toggle and reorder', () => {
    expect(planFor('PATCH', '/workouts/5/toggle').plan?.ops).toEqual([{ method: 'PATCH', url: '/workouts/5/toggle' }])
    const { plan } = planFor('PATCH', '/workouts/5/reorder', { data: { after_id: 1 }, fixture: { ...noFixture, prev: { 5: 3 } } })
    expect(plan?.ops[0]?.data).toEqual({ after_id: 3 })
  })

  it('exercise delete recreates it under the workout', () => {
    const fixture: Fixture = {
      ...noFixture,
      subLists: { 'exercises:5': [{ id: 9, name: 'Squat', sets: 3, reps: 8, done: false, sort_order: 1 }] },
    }
    const { plan } = planFor('DELETE', '/workouts/5/exercises/9', { fixture })
    expect(plan?.ops[0]).toMatchObject({ method: 'POST', url: '/workouts/5/exercises' })
    expect(plan?.ops[0]?.data).toEqual({ name: 'Squat', sets: 3, reps: 8, done: false, sort_order: 1 })
  })

  it('set update restores its fields', () => {
    const fixture: Fixture = { ...noFixture, subLists: { 'sets:5/9': [{ id: 3, set_index: 1, reps: 5, weight: 100, done: true }] } }
    const { plan } = planFor('PUT', '/workouts/5/exercises/9/sets/3', { data: { reps: 6 }, fixture })
    expect(plan?.ops[0]?.data).toEqual({ set_index: 1, reps: 5, weight: 100, done: true })
  })
})

describe('habits & whiteboards', () => {
  it('check-in toggles back with the same date param', () => {
    const { plan } = planFor('POST', '/habits/4/checkin', { params: { date: '2026-09-01' }, result: { checked: true } })
    expect(plan?.ops).toEqual([{ method: 'POST', url: '/habits/4/checkin', params: { date: '2026-09-01' } }])
    expect(plan?.label).toEqual({ action: 'toggle', entity: 'checkin' })
  })

  it('whiteboard node delete recreates it', () => {
    const fixture: Fixture = { ...noFixture, boards: { 1: { nodes: [{ id: 7, ref_type: 'note', label: 'L', x: 1, y: 2 }], edges: [] } } }
    const { plan } = planFor('DELETE', '/whiteboards/1/nodes/7', { fixture })
    expect(plan?.ops[0]).toMatchObject({ method: 'POST', url: '/whiteboards/1/nodes' })
    expect(plan?.ops[0]?.data).toEqual({ ref_type: 'note', label: 'L', x: 1, y: 2 })
  })

  it('whiteboard edge delete recreates it', () => {
    const fixture: Fixture = { ...noFixture, boards: { 1: { nodes: [], edges: [{ id: 3, from_node_id: 1, to_node_id: 2, label: '' }] } } }
    const { plan } = planFor('DELETE', '/whiteboards/1/edges/3', { fixture })
    expect(plan?.ops[0]?.data).toEqual({ from_node_id: 1, to_node_id: 2, label: '' })
  })
})

describe('explicitly not undoable', () => {
  it('pomodoro increment and trash purge record nothing', () => {
    expect(planFor('POST', '/todos/5/pomodoro', { result: {} }).plan).toBeNull()
    expect(planFor('DELETE', '/todos/trash', { result: { purged: 3 } }).plan).toBeNull()
  })
})
