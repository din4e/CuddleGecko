import { request } from './client'
import type { Todo, Event, PaginatedData } from '../types'

export const todosApi = {
  list: (status?: string, page = 1, pageSize = 50, signal?: AbortSignal) =>
    request.get<PaginatedData<Todo>>('/todos', { params: { status, page, page_size: pageSize }, signal }).then((data) => ({ data })),

  create: (data: Partial<Todo>) =>
    request.post<Todo>('/todos', data).then((d) => ({ data: d })),

  update: (id: number, data: Partial<Todo>) =>
    request.put<Todo>(`/todos/${id}`, data).then((d) => ({ data: d })),

  toggleStatus: (id: number) =>
    request.patch<Todo>(`/todos/${id}/toggle`).then((data) => ({ data })),

  syncToEvent: (id: number) =>
    request.post<Event>(`/todos/${id}/sync-event`).then((data) => ({ data })),

  delete: (id: number) =>
    request.delete<void>(`/todos/${id}`).then(() => {}),
}
