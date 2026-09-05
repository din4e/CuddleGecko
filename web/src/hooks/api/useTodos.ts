import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { todosApi } from '../../api/todos'
import { rootKey } from './keys'
import { invalidateScope, markLocalMutation } from '@/lib/querySync'
import type { Todo, TodoItem, TodoActivity, TodoStats, PaginatedData, TodoListParams, TodoStatus, TodoUpdateInput } from '../../types'

const scope = 'todos'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useTodosList(params: TodoListParams = {}) {
  const { page = 1, page_size = 50, ...filters } = params
  const queryKey = [...allKey(), 'list', { ...filters, page, page_size }] as const
  return useQuery<PaginatedData<Todo>>({
    queryKey,
    queryFn: ({ signal }) => todosApi.list({ page, page_size, ...filters }, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

// Accumulating "load more" list for the main views (timeline / grouped / kanban
// / manual). Pagination lives in the pageParams, not the key, so the key stays
// stable while pages stack up. Shares the 'list' key family with useTodosList
// so root-key invalidation and the optimistic updates below cover both.
export function useTodosInfinite(params: TodoListParams = {}, options?: { enabled?: boolean }) {
  // page is deliberately stripped: pagination lives in pageParams, never the key.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { page: _page, page_size = 50, ...filters } = params
  const queryKey = [...allKey(), 'list', { ...filters, page_size }] as const
  return useInfiniteQuery<PaginatedData<Todo>, Error, InfiniteData<PaginatedData<Todo>>, typeof queryKey, number>({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      todosApi.list({ ...filters, page: pageParam, page_size }, signal).then((r) => r.data),
    initialPageParam: 1,
    // The server echoes the page in each chunk; total comes from the first one.
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
      return loaded < (allPages[0]?.total ?? 0) ? lastPage.page + 1 : undefined
    },
    placeholderData: (prev) => prev,
    enabled: options?.enabled,
  })
}

/** Per-parent children slice consumed by the lazy tree. */
export interface TodoChildrenState {
  items: Todo[]
  total: number
  /** Initial load finished (children may still be refetching). */
  loaded: boolean
  hasMore: boolean
  loadMore: () => void
}

const CHILDREN_BASE_PAGE = 100
const CHILDREN_MAX_MULT = 16 // page_size caps at 1600 — enough for any sane parent

// Children of each expanded tree node, one query per parent. useQueries can't
// run infinite queries, so "load more" grows the single page exponentially
// (100 → 200 → 400 …) instead of stacking pages. Queries live in the shared
// 'list' key family (filtered by parent_id) so mutations, WS-triggered
// invalidations and optimistic patches apply automatically.
export function useTodoChildrenMap(parentIds: number[], filters: TodoListParams = {}): Map<number, TodoChildrenState> {
  // Children pages always start at 1 (load-more grows page_size) — strip page.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { page: _page, ...rest } = filters
  const [multByParent, setMultByParent] = useState<Record<number, number>>({})
  // combine returns a plain array of data-only records (no Map, no closures):
  // the queries observer keeps the previous result identity via
  // replaceEqualDeep when nothing changed, so the Map built from it below is
  // identity-stable across renders — downstream memos (buildLazyTree,
  // childrenByParent, subtaskProgress) and memoized rows then don't re-run on
  // unrelated page state changes (a Map return value defeats that deep
  // comparison and used to produce a fresh identity every render).
  const slices = useQueries({
    queries: parentIds.map((parentId) => {
      const mult = Math.min(multByParent[parentId] ?? 1, CHILDREN_MAX_MULT)
      const page_size = CHILDREN_BASE_PAGE * mult
      return {
        queryKey: [...allKey(), 'list', { ...rest, page_size, page: 1, parent_id: parentId }] as const,
        queryFn: ({ signal }: { signal?: AbortSignal }) =>
          todosApi.list({ ...rest, parent_id: parentId, page: 1, page_size }, signal).then((r) => r.data),
        placeholderData: (prev: PaginatedData<Todo> | undefined) => prev,
      }
    }),
    combine: (queries) =>
      queries.map((q, i) => {
        const parentId = parentIds[i]
        const items = q.data?.items ?? []
        return {
          parentId,
          items,
          total: q.data?.total ?? 0,
          loaded: !q.isPending,
          hasMore: items.length < (q.data?.total ?? 0) && (multByParent[parentId] ?? 1) < CHILDREN_MAX_MULT,
        }
      }),
  })
  return useMemo(() => {
    const map = new Map<number, TodoChildrenState>()
    for (const s of slices) {
      map.set(s.parentId, {
        items: s.items,
        total: s.total,
        loaded: s.loaded,
        hasMore: s.hasMore,
        loadMore: () =>
          setMultByParent((prev) => ({
            ...prev,
            [s.parentId]: Math.min((prev[s.parentId] ?? 1) * 2, CHILDREN_MAX_MULT),
          })),
      })
    }
    return map
    // setMultByParent is a stable setState reference — listed only because the
    // loadMore closures capture it (react-hooks/preserve-manual-memoization
    // demands it in the source deps); it can never invalidate the memo.
  }, [slices, setMultByParent])
}

// A cached 'list' entry is either a plain page (useTodosList) or stacked pages
// (useTodosInfinite / children). Optimistic updates must patch both shapes;
// rollbacks restore the original object so they stay shape-agnostic.
function patchTodoItems<T>(data: T, fn: (t: Todo) => Todo): T {
  if (data == null) return data
  if (typeof data === 'object' && 'pages' in data) {
    const inf = data as unknown as InfiniteData<PaginatedData<Todo>>
    return { ...data, pages: inf.pages.map((p) => ({ ...p, items: (p.items ?? []).map(fn) })) } as T
  }
  const page = data as unknown as PaginatedData<Todo>
  return { ...page, items: (page.items ?? []).map(fn) } as T
}

export function useTodoStats() {
  return useQuery<TodoStats>({
    queryKey: [...allKey(), 'stats'] as const,
    queryFn: () => todosApi.stats().then((r) => r.data),
  })
}

export function useTodoTrash(enabled = true) {
  return useQuery<Todo[]>({
    queryKey: [...allKey(), 'trash'] as const,
    queryFn: () => todosApi.listTrash().then((r) => r.data),
    enabled,
  })
}

export function useRestoreTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...allKey(), 'trash'] })
      invalidateScope(qc, scope)
    },
    // TodosPage shows a specific restore-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

// Permanently deletes every trashed todo in the workspace.
export function useEmptyTodoTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => todosApi.emptyTrash(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...allKey(), 'trash'] })
      invalidateScope(qc, scope)
    },
    // TodosPage shows a specific purge-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

// --- Optimistic move/reorder/create helpers ---
// Cached 'list' keys are [...allKey(), 'list', params]; params.parent_id (when
// present) marks a children-slice entry, and its absence means a root list.
type TodoListKey = readonly unknown[]

function listEntryParentId(key: TodoListKey): number | null {
  const params = key[3]
  if (params != null && typeof params === 'object' && 'parent_id' in params) {
    const pid = (params as { parent_id?: number }).parent_id
    return pid ?? null
  }
  return null
}

function listEntryStatus(key: TodoListKey): string | undefined {
  const params = key[3]
  if (params != null && typeof params === 'object' && 'status' in params) {
    return (params as { status?: string }).status
  }
  return undefined
}

// A string param off a cached list entry's key (its sort / order settings).
function listEntryParam(key: TodoListKey, name: 'sort' | 'order'): string | undefined {
  const params = key[3]
  if (params != null && typeof params === 'object' && name in params) {
    const v = (params as Record<string, unknown>)[name]
    return typeof v === 'string' ? v : undefined
  }
  return undefined
}

// Applies an items-array transform to every page of any cached list shape;
// returns null when data matches no known shape (stats, trash, …).
function mapListItems(data: unknown, fn: (items: Todo[]) => Todo[]): unknown {
  if (data == null) return null
  if (typeof data === 'object' && 'pages' in data) {
    const inf = data as unknown as InfiniteData<PaginatedData<Todo>>
    return { ...data, pages: inf.pages.map((p) => ({ ...p, items: fn(p.items ?? []) })) }
  }
  if (typeof data === 'object' && 'items' in data) {
    const page = data as unknown as PaginatedData<Todo>
    return { ...page, items: fn(page.items ?? []) }
  }
  return null
}

// Reorders `moved` after `afterId` (or at the sibling group's top/end) inside
// one items array. Items from other parents stay put; the position only
// matters within the moved todo's new sibling group.
function reorderItems(items: Todo[], moved: Todo, afterId: number | null, position?: string): Todo[] {
  const rest = items.filter((t) => t.id !== moved.id)
  let insertAt: number
  if (afterId != null) {
    const afterIdx = rest.findIndex((t) => t.id === afterId)
    insertAt = afterIdx >= 0 ? afterIdx + 1 : rest.length
  } else if (position === 'last') {
    insertAt = rest.length
  } else {
    const firstSibling = rest.findIndex((t) => (t.parent_id ?? null) === (moved.parent_id ?? null))
    insertAt = firstSibling >= 0 ? firstSibling : 0
  }
  rest.splice(insertAt, 0, moved)
  return rest
}

// Optimistically applies a move/reorder to every cached list entry: the todo
// migrates between parent-filtered children entries and repositions inside
// root lists. Returns a rollback snapshot (Map key → original data).
function optimisticallyMoveTodo(
  qc: ReturnType<typeof useQueryClient>,
  id: number,
  parentId: number | null,
  afterId: number | null,
  position?: string,
): Map<TodoListKey, unknown> {
  const entries = qc.getQueriesData({ queryKey: [...allKey(), 'list'] })
  const anywhere = entries.flatMap(([, data]) => {
    const items: Todo[] =
      data != null && typeof data === 'object' && 'pages' in data
        ? ((data as unknown as InfiniteData<PaginatedData<Todo>>).pages.flatMap((p) => p.items ?? []))
        : data != null && typeof data === 'object' && 'items' in data
          ? ((data as unknown as PaginatedData<Todo>).items ?? [])
          : []
    return items.filter((t) => t.id === id)
  })
  if (anywhere.length === 0) return new Map()
  const moved: Todo = { ...anywhere[0], parent_id: parentId }

  const previous = new Map<TodoListKey, unknown>()
  for (const [key, data] of entries) {
    const entryParent = listEntryParentId(key)
    const next = mapListItems(data, (items) => {
      if (entryParent !== parentId) {
        // Children slice of another parent: the todo only leaves.
        return items.filter((t) => t.id !== id)
      }
      return reorderItems(items, moved, afterId, position)
    })
    if (next != null && next !== data) {
      previous.set(key, data)
      qc.setQueryData(key, next)
    }
  }
  return previous
}

// Inserts a freshly created todo into the cached list entries it plausibly
// belongs to (matching parent and, when the entry filters by status, matching
// status). Entries it can't be placed in are left for the next refetch.
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2, none: 3 }

// Mirrors the backend's todoOrderClause (repository/todo.go): pinned first,
// then pending; the sort key decides; NULL due dates sort last in due-date
// positions regardless of direction; created_at DESC breaks ties. The cached
// items are already in this order (the server produced them), so a first-fit
// insert with this comparator lands the new todo where the refetch will.
function createdInsertComparator(sort: string | undefined, order: string | undefined): (a: Todo, b: Todo) => number {
  const dir = order === 'desc' ? -1 : 1
  const rank = (t: Todo) => PRIORITY_RANK[t.priority ?? ''] ?? 4
  const dueCmp = (a: Todo, b: Todo) => {
    if (a.due_time == null && b.due_time == null) return 0
    if (a.due_time == null) return 1 // dueNullsLast holds for both directions
    if (b.due_time == null) return -1
    return dir * a.due_time.localeCompare(b.due_time)
  }
  const createdDesc = (a: Todo, b: Todo) => (b.created_at ?? '').localeCompare(a.created_at ?? '')
  return (a: Todo, b: Todo) => {
    let c = (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1)
    if (c) return c
    c = (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
    if (c) return c
    switch (sort) {
      case 'manual':
        return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id
      case 'priority':
        c = rank(a) - rank(b)
        if (c) return c
        c = dueCmp(a, b)
        if (c) return c
        return createdDesc(a, b)
      case 'title':
        c = dir * a.title.localeCompare(b.title)
        if (c) return c
        return createdDesc(a, b)
      case 'created':
        return dir * (a.created_at ?? '').localeCompare(b.created_at ?? '')
      case 'due_date':
      default:
        c = dueCmp(a, b)
        if (c) return c
        c = rank(a) - rank(b)
        if (c) return c
        return createdDesc(a, b)
    }
  }
}

// Insert into the entry's FIRST page only and bump its total: later pages are
// offset-based (a row inserted there would surface as a duplicate once page 1
// refetches), and the honest total keeps LoadMoreBar correct until the
// refetch. Returns null for unknown cache shapes (stats, trash, …).
function insertIntoFirstPage(
  data: unknown,
  created: Todo,
  sort: string | undefined,
  order: string | undefined,
): unknown {
  const insert = (items: Todo[]): Todo[] => {
    if (items.some((t) => t.id === created.id)) return items
    const cmp = createdInsertComparator(sort, order)
    const idx = items.findIndex((t) => cmp(created, t) < 0)
    return idx < 0 ? [...items, created] : [...items.slice(0, idx), created, ...items.slice(idx)]
  }
  if (data != null && typeof data === 'object' && 'pages' in data) {
    const inf = data as unknown as InfiniteData<PaginatedData<Todo>>
    const first = inf.pages[0]
    if (first == null || insert(first.items ?? []) === (first.items ?? [])) return data
    return {
      ...data,
      pages: inf.pages.map((p, i) =>
        i === 0 ? { ...p, total: (p.total ?? 0) + 1, items: insert(p.items ?? []) } : p,
      ),
    }
  }
  if (data != null && typeof data === 'object' && 'items' in data) {
    const page = data as unknown as PaginatedData<Todo>
    if (insert(page.items ?? []) === (page.items ?? [])) return data
    return { ...page, total: (page.total ?? 0) + 1, items: insert(page.items ?? []) }
  }
  return null
}

function insertCreatedTodo(qc: ReturnType<typeof useQueryClient>, created: Todo): void {
  for (const [key, data] of qc.getQueriesData({ queryKey: [...allKey(), 'list'] })) {
    if (listEntryParentId(key) !== (created.parent_id ?? null)) continue
    const status = listEntryStatus(key)
    if (status != null && status !== created.status) continue
    const next = insertIntoFirstPage(data, created, listEntryParam(key, 'sort'), listEntryParam(key, 'order'))
    if (next != null && next !== data) qc.setQueryData(key, next)
  }

  // Root lists don't hold the child; grow the parent's child_count there so
  // lazy subtask sections know to mount their children query.
  if (created.parent_id != null) {
    for (const [key, data] of qc.getQueriesData({ queryKey: [...allKey(), 'list'] })) {
      if (listEntryParentId(key) === created.parent_id) continue
      const next = mapListItems(data, (items) =>
        items.map((t) => (t.id === created.parent_id ? { ...t, child_count: (t.child_count ?? 0) + 1 } : t)),
      )
      if (next != null && next !== data) qc.setQueryData(key, next)
    }
  }
}

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Todo>) => todosApi.create(input),
    onSuccess: ({ data: created }) => {
      // Mark the local mutation so the WS echo is dropped, then place the
      // server-returned entity straight into the matching caches — no refetch.
      markLocalMutation(scope)
      insertCreatedTodo(qc, created)
      // The zero-request list insert above can't update the stats strip's
      // pending/done counts (and no other invalidation is coming: the WS echo
      // is suppressed and refetchOnWindowFocus is off) — refetch just that.
      void qc.invalidateQueries({ queryKey: [...allKey(), 'stats'] })
    },
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TodoUpdateInput }) => todosApi.update(id, data),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

// Optimistically flip a todo's status in every cached list page so the checkbox
// responds instantly; rollback on error, and reconcile with the server on
// settle (the refetch also picks up re-sorting and recurring-task advancement).
// Recurring pending tasks are excluded: the server advances their due date
// rather than flipping status, so an optimistic flip would be visibly wrong.
export function useToggleTodoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.toggleStatus(id),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: [...allKey(), 'list'] })
      // Snapshot every cached list entry (paged + infinite), then flip the field
      // per key. (v5's setQueriesData updater receives only `old` — no query
      // arg — so we use getQueriesData pairs instead.)
      const previous = qc.getQueriesData({ queryKey: [...allKey(), 'list'] })
      for (const [key, old] of previous) {
        qc.setQueryData(key, patchTodoItems(old, (t) => {
          if (t.id !== id) return t
          if (t.status === 'pending' && t.repeat) return t
          // The server flips pending→done and any closed state→pending.
          const next = t.status === 'pending' ? 'done' : 'pending'
          return { ...t, status: next, completed_at: next === 'done' ? new Date().toISOString() : null }
        }))
      }
      return { previous: new Map(previous) }
    },
    onError: (_err, _id, ctx) => {
      ctx?.previous.forEach((data, key) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      invalidateScope(qc, scope)
    },
  })
}

// Optimistically set an explicit status (pending / done / abandoned) in every
// cached list page; rollback on error, reconcile via refetch on settle.
export function useSetTodoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TodoStatus }) => todosApi.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: [...allKey(), 'list'] })
      const previous = qc.getQueriesData({ queryKey: [...allKey(), 'list'] })
      for (const [key, old] of previous) {
        qc.setQueryData(key, patchTodoItems(old, (t) =>
          t.id === id
            ? { ...t, status, completed_at: status === 'done' ? t.completed_at ?? new Date().toISOString() : null }
            : t,
        ))
      }
      return { previous: new Map(previous) }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach((data, key) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      invalidateScope(qc, scope)
    },
  })
}

export function useReorderTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, afterId }: { id: number; afterId: number | null }) =>
      todosApi.reorder(id, afterId),
    onMutate: async ({ id, afterId }) => {
      await qc.cancelQueries({ queryKey: [...allKey(), 'list'] })
      const previous = optimisticallyMoveTodo(qc, id, listEntryParentIdOfTodo(qc, id), afterId)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach((data, key) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      // Reconcile with the server's renumbered sort_order — list subtree only,
      // so stats/trash stay untouched.
      markLocalMutation(scope)
      void qc.invalidateQueries({ queryKey: [...allKey(), 'list'] })
    },
  })
}

// The todo's current parent, read from any cached list (null = root / unknown).
function listEntryParentIdOfTodo(qc: ReturnType<typeof useQueryClient>, id: number): number | null {
  for (const [, data] of qc.getQueriesData({ queryKey: [...allKey(), 'list'] })) {
    const items: Todo[] =
      data != null && typeof data === 'object' && 'pages' in data
        ? ((data as unknown as InfiniteData<PaginatedData<Todo>>).pages.flatMap((p) => p.items ?? []))
        : data != null && typeof data === 'object' && 'items' in data
          ? ((data as unknown as PaginatedData<Todo>).items ?? [])
          : []
    const found = items.find((t) => t.id === id)
    if (found) return found.parent_id ?? null
  }
  return null
}

export function useMoveTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, parentId, afterId, position }: {
      id: number
      parentId: number | null
      afterId: number | null
      /** Appends at the end of the sibling group when afterId is null. */
      position?: 'first' | 'last'
    }) => todosApi.move(id, parentId, afterId, position),
    onMutate: async ({ id, parentId, afterId, position }) => {
      await qc.cancelQueries({ queryKey: [...allKey(), 'list'] })
      const previous = optimisticallyMoveTodo(qc, id, parentId, afterId, position)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach((data, key) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      // Move renumbers both sibling groups server-side; reconcile the lists.
      markLocalMutation(scope)
      void qc.invalidateQueries({ queryKey: [...allKey(), 'list'] })
    },
  })
}

export function usePomodoroTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.pomodoro(id),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

// Optimistically flip the pin so the star responds instantly; the refetch on
// settle applies the pinned-first reordering.
export function useTogglePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.togglePin(id),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: [...allKey(), 'list'] })
      const previous = qc.getQueriesData({ queryKey: [...allKey(), 'list'] })
      for (const [key, old] of previous) {
        qc.setQueryData(key, patchTodoItems(old, (t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)))
      }
      return { previous: new Map(previous) }
    },
    onError: (_err, _id, ctx) => {
      ctx?.previous.forEach((data, key) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      invalidateScope(qc, scope)
    },
  })
}

export function useSyncTodoToEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.syncToEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rootKey('todos') })
      qc.invalidateQueries({ queryKey: rootKey('events') })
    },
    // TodosPage shows a specific sync-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

export function useDuplicateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.duplicate(id),
    onSuccess: () => invalidateScope(qc, scope),
    // TodosPage shows a specific duplicate-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.delete(id),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

export function useBulkActionTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: 'complete' | 'delete' }) =>
      todosApi.bulk(ids, action),
    onSuccess: () => invalidateScope(qc, scope),
    // TodosPage shows a specific bulk-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

// --- Checklist (subtask) items ---
// Item mutations invalidate both the item list and the todo list so the
// denormalized item_total / item_done counts on cards stay fresh.

const itemsKey = (todoId: number) => [...allKey(), 'items', todoId] as const

export function useTodoItems(todoId: number | null) {
  return useQuery<TodoItem[]>({
    queryKey: [...allKey(), 'items', todoId] as const,
    queryFn: ({ signal }) => todosApi.listItems(todoId as number, signal).then((r) => r.data),
    enabled: todoId != null,
  })
}

export function useCreateTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => todosApi.createItem(todoId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
      invalidateScope(qc, scope)
    },
  })
}

export function useToggleTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => todosApi.toggleItem(todoId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
      invalidateScope(qc, scope)
    },
  })
}

export function useReorderTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, afterId }: { itemId: number; afterId: number | null }) =>
      todosApi.reorderItem(todoId, itemId, afterId),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey(todoId) }),
  })
}

export function usePromoteTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => todosApi.promoteItem(todoId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
      invalidateScope(qc, scope)
    },
  })
}

export function useDeleteTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => todosApi.deleteItem(todoId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
      invalidateScope(qc, scope)
    },
  })
}

export function useUpdateTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, content, due_time, clear_due_time }: { itemId: number; content: string; due_time?: string | null; clear_due_time?: boolean }) =>
      todosApi.updateItem(todoId, itemId, { content, due_time, clear_due_time }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
    },
  })
}

// --- Tag associations ---

export function useReplaceTodoTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, tagIds }: { todoId: number; tagIds: number[] }) =>
      todosApi.replaceTags(todoId, tagIds),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

// --- Modification history ---

const activitiesKey = (todoId: number) => [...allKey(), 'activities', todoId] as const

export function useTodoActivities(todoId: number | null) {
  return useQuery<TodoActivity[]>({
    queryKey: activitiesKey(todoId as number),
    queryFn: ({ signal }) => todosApi.listActivities(todoId as number, signal).then((r) => r.data),
    enabled: todoId != null,
  })
}
