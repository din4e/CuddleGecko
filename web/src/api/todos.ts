import { request } from './client'
import type { Todo, TodoItem, TodoComment, TodoActivity, TodoStatus, Tag, TodoStats, Event, PaginatedData, TodoListParams, TodoUpdateInput } from '../types'

function buildParams(params?: TodoListParams) {
  const out: Record<string, unknown> = { page: params?.page ?? 1, page_size: params?.page_size ?? 50 }
  const keys: (keyof TodoListParams)[] = [
    'status', 'priority', 'q', 'due_before', 'due_after', 'tag_id', 'started', 'sort', 'order', 'overdue', 'parent_id', 'roots_only',
  ]
  for (const key of keys) {
    const value = params?.[key]
    if (value !== undefined && value !== '' && value !== null) {
      out[key] = value
    }
  }
  return out
}

export const todosApi = {
  list: (params?: TodoListParams, signal?: AbortSignal) =>
    request.get<PaginatedData<Todo>>('/todos', { params: buildParams(params), signal }).then((data) => ({ data })),

  stats: () =>
    request.get<TodoStats>('/todos/stats').then((data) => ({ data })),

  listTrash: () =>
    request.get<Todo[]>('/todos/trash').then((data) => ({ data })),

  restore: (id: number) =>
    request.post<void>(`/todos/${id}/restore`).then(() => {}),

  create: (data: Partial<Todo>) =>
    request.post<Todo>('/todos', data).then((d) => ({ data: d })),

  update: (id: number, data: TodoUpdateInput) =>
    request.put<Todo>(`/todos/${id}`, data).then((d) => ({ data: d })),

  toggleStatus: (id: number) =>
    request.patch<Todo>(`/todos/${id}/toggle`).then((data) => ({ data })),

  setStatus: (id: number, status: TodoStatus) =>
    request.patch<Todo>(`/todos/${id}/status`, { status }).then((data) => ({ data })),

  reorder: (id: number, afterId: number | null) =>
    request.patch<void>(`/todos/${id}/reorder`, { after_id: afterId }).then(() => {}),

  move: (id: number, parentId: number | null, afterId: number | null, position?: 'first' | 'last') =>
    request.patch<void>(`/todos/${id}/move`, { parent_id: parentId, after_id: afterId, position }).then(() => {}),

  togglePin: (id: number) =>
    request.patch<Todo>(`/todos/${id}/pin`).then((data) => ({ data })),

  syncToEvent: (id: number) =>
    request.post<Event>(`/todos/${id}/sync-event`).then((data) => ({ data })),

  duplicate: (id: number) =>
    request.post<Todo>(`/todos/${id}/duplicate`).then((d) => ({ data: d })),

  pomodoro: (id: number) =>
    request.post<void>(`/todos/${id}/pomodoro`).then(() => {}),

  delete: (id: number) =>
    request.delete<void>(`/todos/${id}`).then(() => {}),

  bulk: (ids: number[], action: 'complete' | 'delete') =>
    request.post<{ affected: number }>('/todos/bulk', { ids, action }).then((data) => ({ data })),

  // --- Checklist (subtask) items ---

  listItems: (todoId: number, signal?: AbortSignal) =>
    request.get<TodoItem[]>(`/todos/${todoId}/items`, { signal }).then((data) => ({ data })),

  createItem: (todoId: number, content: string) =>
    request.post<TodoItem>(`/todos/${todoId}/items`, { content }).then((d) => ({ data: d })),

  updateItem: (todoId: number, itemId: number, data: { content: string; due_time?: string | null; clear_due_time?: boolean }) =>
    request.put<TodoItem>(`/todos/${todoId}/items/${itemId}`, data).then((d) => ({ data: d })),

  toggleItem: (todoId: number, itemId: number) =>
    request.patch<TodoItem>(`/todos/${todoId}/items/${itemId}/toggle`).then((data) => ({ data })),

  reorderItem: (todoId: number, itemId: number, afterId: number | null) =>
    request.patch<void>(`/todos/${todoId}/items/${itemId}/reorder`, { after_id: afterId }).then(() => {}),

  deleteItem: (todoId: number, itemId: number) =>
    request.delete<void>(`/todos/${todoId}/items/${itemId}`).then(() => {}),

  promoteItem: (todoId: number, itemId: number) =>
    request.post<Todo>(`/todos/${todoId}/items/${itemId}/promote`).then((d) => ({ data: d })),

  // --- Tag associations ---

  getTags: (todoId: number) =>
    request.get<Tag[]>(`/todos/${todoId}/tags`).then((data) => ({ data })),

  replaceTags: (todoId: number, tagIds: number[]) =>
    request.put<void>(`/todos/${todoId}/tags`, { tag_ids: tagIds }).then(() => {}),

  // --- Comments (markdown notes) ---

  listComments: (todoId: number, signal?: AbortSignal) =>
    request.get<TodoComment[]>(`/todos/${todoId}/comments`, { signal }).then((data) => ({ data })),

  createComment: (todoId: number, content: string) =>
    request.post<TodoComment>(`/todos/${todoId}/comments`, { content }).then((d) => ({ data: d })),

  updateComment: (todoId: number, commentId: number, content: string) =>
    request.put<TodoComment>(`/todos/${todoId}/comments/${commentId}`, { content }).then((d) => ({ data: d })),

  deleteComment: (todoId: number, commentId: number) =>
    request.delete<void>(`/todos/${todoId}/comments/${commentId}`).then(() => {}),

  // --- Modification history (audit log) ---

  listActivities: (todoId: number, signal?: AbortSignal) =>
    request.get<TodoActivity[]>(`/todos/${todoId}/activities`, { signal }).then((data) => ({ data })),
}
