import { useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { todosApi } from '../../api/todos'
import { rootKey } from './keys'
import type { Todo, TodoItem, TodoComment, TodoActivity, TodoStats, PaginatedData, TodoListParams, TodoStatus, TodoUpdateInput } from '../../types'

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
  return useQueries({
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
    combine: (queries) => {
      const map = new Map<number, TodoChildrenState>()
      queries.forEach((q, i) => {
        const parentId = parentIds[i]
        const items = q.data?.items ?? []
        map.set(parentId, {
          items,
          total: q.data?.total ?? 0,
          loaded: !q.isPending,
          hasMore: items.length < (q.data?.total ?? 0) && (multByParent[parentId] ?? 1) < CHILDREN_MAX_MULT,
          loadMore: () => setMultByParent((prev) => ({ ...prev, [parentId]: Math.min((prev[parentId] ?? 1) * 2, CHILDREN_MAX_MULT) })),
        })
      })
      return map
    },
  })
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
      qc.invalidateQueries({ queryKey: allKey() })
    },
    // TodosPage shows a specific restore-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Todo>) => todosApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TodoUpdateInput }) => todosApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
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
      qc.invalidateQueries({ queryKey: allKey() })
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
      qc.invalidateQueries({ queryKey: allKey() })
    },
  })
}

export function useReorderTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, afterId }: { id: number; afterId: number | null }) =>
      todosApi.reorder(id, afterId),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function usePomodoroTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.pomodoro(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
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
      qc.invalidateQueries({ queryKey: allKey() })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    // TodosPage shows a specific duplicate-failed toast; suppress the global one.
    meta: { localErrorHandling: true },
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useBulkActionTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: 'complete' | 'delete' }) =>
      todosApi.bulk(ids, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
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
      qc.invalidateQueries({ queryKey: allKey() })
    },
  })
}

export function useToggleTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => todosApi.toggleItem(todoId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
      qc.invalidateQueries({ queryKey: allKey() })
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
      qc.invalidateQueries({ queryKey: allKey() })
    },
  })
}

export function useDeleteTodoItem(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => todosApi.deleteItem(todoId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey(todoId) })
      qc.invalidateQueries({ queryKey: allKey() })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

// --- Comments (markdown notes) + modification history ---

const commentsKey = (todoId: number) => [...allKey(), 'comments', todoId] as const

export function useTodoComments(todoId: number | null) {
  return useQuery<TodoComment[]>({
    queryKey: commentsKey(todoId as number),
    queryFn: ({ signal }) => todosApi.listComments(todoId as number, signal).then((r) => r.data),
    enabled: todoId != null,
  })
}

export function useCreateTodoComment(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => todosApi.createComment(todoId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(todoId) })
      qc.invalidateQueries({ queryKey: [...allKey(), 'activities', todoId] })
    },
  })
}

export function useUpdateTodoComment(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: number; content: string }) =>
      todosApi.updateComment(todoId, commentId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentsKey(todoId) }),
  })
}

export function useDeleteTodoComment(todoId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: number) => todosApi.deleteComment(todoId, commentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(todoId) })
      qc.invalidateQueries({ queryKey: [...allKey(), 'activities', todoId] })
    },
  })
}

const activitiesKey = (todoId: number) => [...allKey(), 'activities', todoId] as const

export function useTodoActivities(todoId: number | null) {
  return useQuery<TodoActivity[]>({
    queryKey: activitiesKey(todoId as number),
    queryFn: ({ signal }) => todosApi.listActivities(todoId as number, signal).then((r) => r.data),
    enabled: todoId != null,
  })
}
