import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { applyDataChanged, invalidateScope, markLocalMutation, patchEntityInScope, removeEntityFromScope } from '../querySync'
import type { DataChangedMessage } from '../wsSync'

// QueryClient with retry off so refetches triggered by invalidation surface
// immediately in the mocked queryFns.
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

type Item = { id: number; title: string }

function msg(partial: Partial<DataChangedMessage>): DataChangedMessage {
  return { workspaceId: 1, resource: 'todos', kind: 'updated', id: 0, ...partial }
}

// querySync reads localStorage (workspace segment) at call time; pin it to a
// fixed workspace — jsdom in this suite has no real storage accessor bound.
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
})
store['current_workspace_id'] = '7'

describe('applyDataChanged', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('patches an updated entity into paginated and infinite caches without refetching', async () => {
    const qc = makeClient()
    const fetcher = vi.fn(() => Promise.resolve({ items: [{ id: 1, title: 'old' }], total: 1, page: 1, page_size: 50 }))
    await qc.prefetchQuery({ queryKey: ['todos', '7', 'list', {}], queryFn: fetcher })
    await qc.prefetchQuery({
      queryKey: ['todos', '7', 'list', { page_size: 50 }],
      queryFn: () => Promise.resolve({ pages: [{ items: [{ id: 1, title: 'old' }], total: 1, page: 1, page_size: 50 }] }),
    })

    applyDataChanged(qc, msg({ entity: { id: 1, title: 'new' } }))

    const page = qc.getQueryData(['todos', '7', 'list', {}]) as { items: Item[] }
    const inf = qc.getQueryData(['todos', '7', 'list', { page_size: 50 }]) as { pages: Array<{ items: Item[] }> }
    expect(page.items[0].title).toBe('new')
    expect(inf.pages[0].items[0].title).toBe('new')
    // Patching is synchronous — no refetch was triggered.
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('removes a deleted entity from cached arrays in place', async () => {
    const qc = makeClient()
    await qc.prefetchQuery({ queryKey: ['habits', '7', 'list'], queryFn: () => Promise.resolve([{ id: 1 }, { id: 2 }]) })

    applyDataChanged(qc, msg({ resource: 'habits', kind: 'deleted', id: 1 }))

    expect(qc.getQueryData(['habits', '7', 'list'])).toEqual([{ id: 2 }])
  })

  it('invalidates the scope list subtree on created frames', () => {
    const qc = makeClient()
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined as never)
    applyDataChanged(qc, msg({ kind: 'created', id: 9 }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['todos', '7', 'list'] })
  })

  it('invalidates the whole scope on bulk frames', () => {
    const qc = makeClient()
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined as never)
    applyDataChanged(qc, msg({ kind: 'bulk' }))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('drops frames for a scope that was just mutated locally (echo)', () => {
    const qc = makeClient()
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined as never)

    invalidateScope(qc, 'todos') // local mutation path
    expect(spy).toHaveBeenCalledTimes(1)

    applyDataChanged(qc, msg({ kind: 'bulk' }))
    applyDataChanged(qc, msg({ kind: 'created', id: 5 }))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('re-applies after the echo window elapses', () => {
    vi.useFakeTimers()
    try {
      const qc = makeClient()
      markLocalMutation('todos')
      vi.advanceTimersByTime(1500)
      const spy = vi.spyOn(qc, 'invalidateQueries').mockReturnValue(Promise.resolve())
      applyDataChanged(qc, msg({ kind: 'bulk' }))
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('cache patch helpers', () => {
  it('patchEntityInScope merges the entity over the cached copy', async () => {
    const qc = makeClient()
    await qc.prefetchQuery({
      queryKey: ['contacts', '7', 'list', {}],
      queryFn: () => Promise.resolve({ items: [{ id: 3, title: 'a', notes: 'keep' }], total: 1, page: 1, page_size: 20 }),
    })
    patchEntityInScope(qc, 'contacts', { id: 3, title: 'b' } as never)
    expect(qc.getQueryData(['contacts', '7', 'list', {}])).toMatchObject({
      items: [{ id: 3, title: 'b', notes: 'keep' }],
    })
  })

  it('removeEntityFromScope leaves unrelated keys untouched', async () => {
    const qc = makeClient()
    await qc.prefetchQuery({
      queryKey: ['tags', '7', 'stats'],
      queryFn: () => Promise.resolve({ count: 5 }),
    })
    removeEntityFromScope(qc, 'tags', 1)
    expect(qc.getQueryData(['tags', '7', 'stats'])).toEqual({ count: 5 })
  })
})
