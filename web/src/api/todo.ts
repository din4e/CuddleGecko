import client from './client'
import type { Todo, Event } from '../types'

export const todoApi = {
  list: (status?: string) =>
    client.get<Todo[]>('/todos', { params: { status } }),

  create: (data: Partial<Todo>) =>
    client.post<Todo>('/todos', data),

  update: (id: number, data: Partial<Todo>) =>
    client.put<Todo>(`/todos/${id}`, data),

  toggleStatus: (id: number) =>
    client.patch<Todo>(`/todos/${id}/toggle`),

  syncToEvent: (id: number) =>
    client.post<Event>(`/todos/${id}/sync-event`),

  delete: (id: number) =>
    client.delete(`/todos/${id}`),
}
