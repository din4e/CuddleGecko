import { request } from './client'
import type { Todo, Event, TodoList, TodoItem, Tag, PaginatedData } from '../types'

export interface TodoListParams {
  status?: string
  list_id?: string // 'inbox' | number | undefined
  tag_ids?: number[]
  overdue?: boolean
  page?: number
  page_size?: number
}

export const todosApi = {
  list: (params: TodoListParams = {}, signal?: AbortSignal) =>
    request.get<PaginatedData<Todo>>('/todos', {
      params: {
        status: params.status,
        list_id: params.list_id,
        tag_ids: params.tag_ids,
        overdue: params.overdue ? 'true' : undefined,
        page: params.page ?? 1,
        page_size: params.page_size ?? 50,
      },
      signal,
    }).then((data) => ({ data })),

  create: (data: Partial<Todo> & { tag_ids?: number[] }) =>
    request.post<Todo>('/todos', data).then((d) => ({ data: d })),

  update: (id: number, data: Partial<Todo> & { tag_ids?: number[] }) =>
    request.put<Todo>(`/todos/${id}`, data).then((d) => ({ data: d })),

  toggleStatus: (id: number) =>
    request.patch<Todo>(`/todos/${id}/toggle`).then((data) => ({ data })),

  syncToEvent: (id: number) =>
    request.post<Event>(`/todos/${id}/sync-event`).then((data) => ({ data })),

  delete: (id: number) =>
    request.delete<void>(`/todos/${id}`).then(() => {}),

  // Tags
  getTags: (id: number) =>
    request.get<Tag[]>(`/todos/${id}/tags`).then((data) => ({ data })),
  setTags: (id: number, tag_ids: number[]) =>
    request.put<void>(`/todos/${id}/tags`, { tag_ids }).then(() => ({})),

  // Lists
  listLists: (signal?: AbortSignal) =>
    request.get<TodoList[]>('/todo-lists', { signal }).then((data) => ({ data })),
  createList: (data: Partial<TodoList>) =>
    request.post<TodoList>('/todo-lists', data).then((d) => ({ data: d })),
  updateList: (id: number, data: Partial<TodoList>) =>
    request.put<TodoList>(`/todo-lists/${id}`, data).then((d) => ({ data: d })),
  deleteList: (id: number) =>
    request.delete<void>(`/todo-lists/${id}`).then(() => {}),

  // Sub-tasks
  listItems: (todoId: number, signal?: AbortSignal) =>
    request.get<TodoItem[]>(`/todos/${todoId}/items`, { signal }).then((data) => ({ data })),
  createItem: (todoId: number, title: string) =>
    request.post<TodoItem>(`/todos/${todoId}/items`, { title }).then((d) => ({ data: d })),
  updateItem: (todoId: number, itemId: number, data: Partial<TodoItem>) =>
    request.put<TodoItem>(`/todos/${todoId}/items/${itemId}`, data).then((d) => ({ data: d })),
  toggleItem: (todoId: number, itemId: number) =>
    request.patch<TodoItem>(`/todos/${todoId}/items/${itemId}/toggle`).then((data) => ({ data })),
  deleteItem: (todoId: number, itemId: number) =>
    request.delete<void>(`/todos/${todoId}/items/${itemId}`).then(() => {}),
}
