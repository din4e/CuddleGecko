import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todosApi, type TodoListParams } from '../../api/todos'
import { rootKey } from './keys'
import type { Todo, TodoList, PaginatedData } from '../../types'

const scope = 'todos'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useTodosList(params: TodoListParams = {}) {
  const { page = 1, page_size = 50, status, list_id, tag_ids, overdue } = params
  return useQuery<PaginatedData<Todo>>({
    queryKey: [...allKey(), 'list', { status, list_id, tag_ids, overdue, page, page_size }] as const,
    queryFn: ({ signal }) => todosApi.list(params, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Todo> & { tag_ids?: number[] }) => todosApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Todo> & { tag_ids?: number[] } }) => todosApi.update(id, data),
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

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useSetTodoTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, tag_ids }: { id: number; tag_ids: number[] }) => todosApi.setTags(id, tag_ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

// ---- Lists ----
export function useTodoLists() {
  return useQuery<TodoList[]>({
    queryKey: [...allKey(), 'lists'] as const,
    queryFn: ({ signal }) => todosApi.listLists(signal).then((r) => r.data),
  })
}

export function useCreateTodoList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TodoList>) => todosApi.createList(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...allKey(), 'lists'] }),
  })
}

export function useUpdateTodoList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TodoList> }) => todosApi.updateList(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...allKey(), 'lists'] }),
  })
}

export function useDeleteTodoList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todosApi.deleteList(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...allKey(), 'lists'] })
      qc.invalidateQueries({ queryKey: allKey() })
    },
  })
}

// ---- Sub-tasks (items are embedded in the todo list response, so mutations
//      just invalidate the todos list query) ----
export function useCreateTodoItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, title }: { todoId: number; title: string }) => todosApi.createItem(todoId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useToggleTodoItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, itemId }: { todoId: number; itemId: number }) => todosApi.toggleItem(todoId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useDeleteTodoItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, itemId }: { todoId: number; itemId: number }) => todosApi.deleteItem(todoId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}
