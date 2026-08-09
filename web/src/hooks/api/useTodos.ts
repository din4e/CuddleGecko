import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todosApi } from '../../api/todos'
import { rootKey } from './keys'
import type { Todo, TodoItem, TodoStats, PaginatedData, TodoListParams, TodoUpdateInput } from '../../types'

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

export function useToggleTodoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.toggleStatus(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
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
    mutationFn: ({ id, parentId, afterId }: { id: number; parentId: number | null; afterId: number | null }) =>
      todosApi.move(id, parentId, afterId),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useTogglePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.togglePin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
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
  })
}

export function useDuplicateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
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
