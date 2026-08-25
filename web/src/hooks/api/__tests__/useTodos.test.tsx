import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTodosList, useTodosInfinite, useTodoChildrenMap, useToggleTodoStatus, useTogglePin, useSetTodoStatus } from '../useTodos'
import { todosApi } from '../../../api/todos'
import type { Todo, TodoListParams, PaginatedData } from '../../../types'

// Regression tests for the optimistic toggle/pin hooks. An adversarial review
// found the original onMutate read a second `query` argument TanStack v5 never
// passes — onMutate threw and the request was NEVER sent (toggling was fully
// broken). These exercise the hooks against a real QueryClient so any regression
// of that class (updater arity, multi-key snapshot/rollback, recurring exclusion)
// fails loudly.

vi.mock('../../../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    toggleStatus: vi.fn(),
    setStatus: vi.fn(),
    togglePin: vi.fn(),
  },
}))

// rootKey reads localStorage at call time; pin it to a fixed workspace so the
// query keys in these tests are deterministic (and no real storage is touched).
vi.mock('../keys', () => ({
  rootKey: (scope: string) => [scope, 'default'] as const,
}))

const page = (items: Todo[]): PaginatedData<Todo> => ({ items, total: items.length, page: 1, page_size: 50 })

function makeTodo(partial: Partial<Todo>): Todo {
  return {
    id: 1, title: 't', status: 'pending', priority: 'normal', pinned: false,
    contact_ids: [], tags: [], pomodoro_count: 0, item_total: 0, item_done: 0,
    sort_order: 0, repeat: '', repeat_interval: 1, created_at: '', updated_at: '',
    ...partial,
  } as Todo
}

function createWrapper() {
  const queryClient = new QueryClient({
    // gcTime Infinity so the manually-seeded (inactive) cache page survives —
    // it holds the optimistic flip with no observers to refetch it.
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

const twoPages = {
  filterA: page([makeTodo({ id: 1, status: 'pending' })]),
  filterB: page([makeTodo({ id: 1, status: 'pending' }), makeTodo({ id: 2 })]),
}

describe('useToggleTodoStatus (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the request and flips status across every cached list page', async () => {
    // Stateful mock server: the toggle mutates server state, so the
    // post-mutation refetch (onSettled invalidation) returns the TOGGLED data
    // — exactly like the real backend. This is what lets the optimistic value
    // survive reconciliation.
    let serverStatus = 'pending'
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockImplementation(async () => ({
      data: page([makeTodo({ id: 1, status: serverStatus as Todo['status'] })]),
    }) as never)
    const toggled = vi.mocked(todosApi.toggleStatus)
    toggled.mockImplementation(async () => {
      serverStatus = serverStatus === 'done' ? 'pending' : 'done'
      return { data: undefined } as never
    })

    const { Wrapper, queryClient } = createWrapper()
    const listA = renderHook(() => useTodosList({ status: 'pending' }), { wrapper: Wrapper })
    await waitFor(() => expect(listA.result.current.data).toBeDefined())

    // Seed a second cached page (different key) that also contains todo 1.
    queryClient.setQueryData(
      ['todos', 'default', 'list', { page: 1, page_size: 50, status: 'done' }],
      twoPages.filterB,
    )

    const toggle = renderHook(() => useToggleTodoStatus(), { wrapper: Wrapper })
    await act(async () => { await toggle.result.current.mutateAsync(1) })

    // THE critical assertion: the request must actually be sent (the old
    // updater-arity bug threw in onMutate before mutationFn ever ran).
    expect(toggled).toHaveBeenCalledWith(1)

    // Both cached pages show the toggled state after reconciliation.
    await waitFor(() => {
      const a = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50, status: 'pending' }])
      expect(a?.items.find((t) => t.id === 1)?.status).toBe('done')
    })
    // The manually-seeded page was optimistically flipped too (it's inactive —
    // no refetch — so the optimistic value persists there).
    const b = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50, status: 'done' }])
    expect(b?.items.find((t) => t.id === 1)?.status).toBe('done')
  })

  it('rolls back every page when the request fails', async () => {
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockResolvedValue({ data: twoPages.filterA } as never)
    const toggled = vi.mocked(todosApi.toggleStatus)
    toggled.mockRejectedValue(new Error('network') as never)

    const { Wrapper, queryClient } = createWrapper()
    const listA = renderHook(() => useTodosList({ status: 'pending' }), { wrapper: Wrapper })
    await waitFor(() => expect(listA.result.current.data).toBeDefined())
    queryClient.setQueryData(
      ['todos', 'default', 'list', { page: 1, page_size: 50, status: 'done' }],
      twoPages.filterB,
    )

    const toggle = renderHook(() => useToggleTodoStatus(), { wrapper: Wrapper })
    await act(async () => {
      await toggle.result.current.mutateAsync(1).catch(() => {}) // expected failure
    })

    const a = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50, status: 'pending' }])
    const b = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50, status: 'done' }])
    expect(a?.items.find((t) => t.id === 1)?.status).toBe('pending')
    expect(b?.items.find((t) => t.id === 1)?.status).toBe('pending')
  })

  it('does not optimistically flip recurring pending todos (server advances them instead)', async () => {
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockResolvedValue({
      data: page([makeTodo({ id: 7, status: 'pending', repeat: 'daily' })]),
    } as never)
    const toggled = vi.mocked(todosApi.toggleStatus)
    toggled.mockResolvedValue({ data: undefined } as never)

    const { Wrapper, queryClient } = createWrapper()
    const list = renderHook(() => useTodosList({ status: 'pending' }), { wrapper: Wrapper })
    await waitFor(() => expect(list.result.current.data).toBeDefined())

    const toggle = renderHook(() => useToggleTodoStatus(), { wrapper: Wrapper })
    await act(async () => { await toggle.result.current.mutateAsync(7) })

    expect(toggled).toHaveBeenCalledWith(7) // request still sent
    const cached = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50, status: 'pending' }])
    expect(cached?.items.find((t) => t.id === 7)?.status).toBe('pending') // but no local flip
  })

  it('flips status inside infinite-shaped cache entries too', async () => {
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockResolvedValue({ data: page([makeTodo({ id: 1, status: 'pending' })]) } as never)
    const toggled = vi.mocked(todosApi.toggleStatus)
    toggled.mockResolvedValue({ data: undefined } as never)

    const { Wrapper, queryClient } = createWrapper()
    const list = renderHook(() => useTodosList({ status: 'pending' }), { wrapper: Wrapper })
    await waitFor(() => expect(list.result.current.data).toBeDefined())

    // Seed an inactive infinite-shaped entry (the lazy-tree roots query) with
    // the same todo — patchTodoItems must reach into .pages[].items.
    const infiniteSeed: InfiniteData<PaginatedData<Todo>> = {
      pages: [page([makeTodo({ id: 1, status: 'pending' })])],
      pageParams: [1],
    }
    queryClient.setQueryData(['todos', 'default', 'list', { page_size: 50, roots_only: true }], infiniteSeed)

    const toggle = renderHook(() => useToggleTodoStatus(), { wrapper: Wrapper })
    await act(async () => { await toggle.result.current.mutateAsync(1) })

    const seeded = queryClient.getQueryData<InfiniteData<PaginatedData<Todo>>>(['todos', 'default', 'list', { page_size: 50, roots_only: true }])
    expect(seeded?.pages[0].items.find((t) => t.id === 1)?.status).toBe('done')
  })
})

describe('useTodosInfinite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stacks pages and exposes hasMore / fetchNextPage', async () => {
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockImplementation(async (params?: TodoListParams) => {
      if ((params?.page ?? 1) === 1) {
        return { data: { items: [makeTodo({ id: 1 })], total: 3, page: 1, page_size: 2 } } as never
      }
      return { data: { items: [makeTodo({ id: 2 }), makeTodo({ id: 3 })], total: 3, page: 2, page_size: 2 } } as never
    })

    const { Wrapper } = createWrapper()
    const list = renderHook(() => useTodosInfinite({ page_size: 2 }), { wrapper: Wrapper })
    await waitFor(() => expect(list.result.current.data?.pages).toHaveLength(1))
    expect(list.result.current.hasNextPage).toBe(true)
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 2 }), expect.anything())

    await act(async () => { await list.result.current.fetchNextPage() })
    // The appended page lands asynchronously from fetchNextPage's resolution,
    // so wait for the accumulated data instead of reading synchronously.
    await waitFor(() => expect(list.result.current.data?.pages).toHaveLength(2))
    expect(list.result.current.data?.pages.flatMap((p) => p.items.map((t) => t.id))).toEqual([1, 2, 3])
    expect(list.result.current.hasNextPage).toBe(false)
  })
})

describe('useTodoChildrenMap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs one parent-filtered list query per parent id', async () => {
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockImplementation(async (params?: TodoListParams) => ({
      data: page([makeTodo({ id: (params?.parent_id ?? 0) + 100, parent_id: params?.parent_id ?? null })]),
    }) as never)

    const { Wrapper } = createWrapper()
    const children = renderHook(() => useTodoChildrenMap([5, 9], {}), { wrapper: Wrapper })
    await waitFor(() => expect(children.result.current.get(5)?.loaded).toBe(true))

    expect(children.result.current.get(5)?.items.map((t) => t.id)).toEqual([105])
    expect(children.result.current.get(9)?.items.map((t) => t.id)).toEqual([109])
    expect(children.result.current.get(5)?.hasMore).toBe(false)
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ parent_id: 5, page: 1, page_size: 100 }), expect.anything())
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ parent_id: 9, page: 1, page_size: 100 }), expect.anything())
  })
})

describe('useSetTodoStatus (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('abandons a todo across every cached list page and rolls back on failure', async () => {
    let serverStatus = 'pending'
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockImplementation(async () => ({
      data: page([makeTodo({ id: 1, status: serverStatus as Todo['status'] })]),
    }) as never)
    const setStatus = vi.mocked(todosApi.setStatus)
    setStatus.mockImplementation(async (_id: number, status: Todo['status']) => {
      serverStatus = status
      return { data: undefined } as never
    })

    const { Wrapper, queryClient } = createWrapper()
    const list = renderHook(() => useTodosList({}), { wrapper: Wrapper })
    await waitFor(() => expect(list.result.current.data).toBeDefined())
    // Seed a second (inactive) cached page containing the same todo.
    queryClient.setQueryData(
      ['todos', 'default', 'list', { page: 1, page_size: 50, status: 'done' }],
      page([makeTodo({ id: 1, status: 'pending' })]),
    )

    const setter = renderHook(() => useSetTodoStatus(), { wrapper: Wrapper })
    await act(async () => { await setter.result.current.mutateAsync({ id: 1, status: 'abandoned' }) })

    expect(setStatus).toHaveBeenCalledWith(1, 'abandoned')
    await waitFor(() => {
      const a = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50 }])
      expect(a?.items.find((t) => t.id === 1)?.status).toBe('abandoned')
    })
    const b = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50, status: 'done' }])
    expect(b?.items.find((t) => t.id === 1)?.status).toBe('abandoned')

    // Failure path: a rejected request restores the previous status everywhere.
    setStatus.mockRejectedValue(new Error('network') as never)
    await act(async () => {
      await setter.result.current.mutateAsync({ id: 1, status: 'pending' }).catch(() => {})
    })
    expect(b?.items.find((t) => t.id === 1)?.status).toBe('abandoned') // rolled back to the pre-mutation value
  })
})

describe('useTogglePin (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('flips pinned and sends the request', async () => {
    // Stateful mock server (see toggle test): pin flips server state so the
    // post-mutation refetch agrees with the optimistic value.
    let serverPinned = false
    const mockedList = vi.mocked(todosApi.list)
    mockedList.mockImplementation(async () => ({
      data: page([makeTodo({ id: 1, pinned: serverPinned })]),
    }) as never)
    const pin = vi.mocked(todosApi.togglePin)
    pin.mockImplementation(async () => {
      serverPinned = !serverPinned
      return { data: undefined } as never
    })

    const { Wrapper, queryClient } = createWrapper()
    const list = renderHook(() => useTodosList({}), { wrapper: Wrapper })
    await waitFor(() => expect(list.result.current.data).toBeDefined())

    const toggle = renderHook(() => useTogglePin(), { wrapper: Wrapper })
    await act(async () => { await toggle.result.current.mutateAsync(1) })

    expect(pin).toHaveBeenCalledWith(1)
    await waitFor(() => {
      const cached = queryClient.getQueryData<PaginatedData<Todo>>(['todos', 'default', 'list', { page: 1, page_size: 50 }])
      expect(cached?.items.find((t) => t.id === 1)?.pinned).toBe(true)
    })
  })
})
