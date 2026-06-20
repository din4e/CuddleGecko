import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todosApi } from '../../api/todos'
import { rootKey } from './keys'
import type { Todo, PaginatedData } from '../../types'

const scope = 'todos'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useTodosList(status: string | undefined, page = 1, pageSize = 50) {
  return useQuery<PaginatedData<Todo>>({
    queryKey: [...allKey(), 'list', { status, page, page_size: pageSize }] as const,
    queryFn: ({ signal }) => todosApi.list(status, page, pageSize, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
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
    mutationFn: ({ id, data }: { id: number; data: Partial<Todo> }) => todosApi.update(id, data),
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
