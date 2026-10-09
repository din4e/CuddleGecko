import { request } from './client'
import type { Todo, TodoItem, TodoActivity, TodoStatus, TodoPriority, TodoBulkAction, Tag, TodoStats, Event, PaginatedData, TodoListParams, TodoUpdateInput } from '../types'

function buildParams(params?: TodoListParams) {
  const out: Record<string, unknown> = { page: params?.page ?? 1, page_size: params?.page_size ?? 50 }
  const keys: (keyof TodoListParams)[] = [
    'status', 'priority', 'importance', 'urgency', 'q', 'due_before', 'due_after', 'done_after', 'deferred', 'started', 'no_due', 'tag_id', 'sort', 'order', 'overdue', 'parent_id', 'roots_only', 'linking_to',
  ]
  for (const key of keys) {
    const value = params?.[key]
    if (value === undefined || value === '' || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

export const todosApi = {
  list: (params?: TodoListParams, signal?: AbortSignal) =>
    // indexes:null serializes array params (tag_id=[1,2]) as repeated keys
    // (?tag_id=1&tag_id=2) — the backend reads them via QueryArray (any-of OR).
    request.get<PaginatedData<Todo>>('/todos', { params: buildParams(params), paramsSerializer: { indexes: null }, signal }).then((data) => ({ data })),

  stats: () =>
    request.get<TodoStats>('/todos/stats').then((data) => ({ data })),

  get: (id: string, signal?: AbortSignal) =>
    request.get<Todo>(`/todos/${id}`, { signal }).then((data) => ({ data })),

  listTrash: () =>
    request.get<Todo[]>('/todos/trash').then((data) => ({ data })),

  emptyTrash: () =>
    request.delete<{ purged: number }>('/todos/trash').then((data) => ({ data })),

  restore: (id: string) =>
    request.post<void>(`/todos/${id}/restore`).then(() => {}),

  create: (data: Partial<Todo>) =>
    request.post<Todo>('/todos', data).then((d) => ({ data: d })),

  update: (id: string, data: TodoUpdateInput) =>
    request.put<Todo>(`/todos/${id}`, data).then((d) => ({ data: d })),

  toggleStatus: (id: string) =>
    request.patch<Todo>(`/todos/${id}/toggle`).then((data) => ({ data })),

  setProgress: (id: string, progress: number | null) =>
    request.patch<void>(`/todos/${id}/progress`, progress === null ? { clear: true } : { progress }).then(() => {}),

  setStatus: (id: string, status: TodoStatus) =>
    request.patch<Todo>(`/todos/${id}/status`, { status }).then((data) => ({ data })),

  reorder: (id: string, afterId: string | null) =>
    request.patch<void>(`/todos/${id}/reorder`, { after_id: afterId }).then(() => {}),

  move: (id: string, parentId: string | null, afterId: string | null, position?: 'first' | 'last') =>
    request.patch<void>(`/todos/${id}/move`, { parent_id: parentId, after_id: afterId, position }).then(() => {}),

  togglePin: (id: string) =>
    request.patch<Todo>(`/todos/${id}/pin`).then((data) => ({ data })),

  syncToEvent: (id: string) =>
    request.post<Event>(`/todos/${id}/sync-event`).then((data) => ({ data })),

  duplicate: (id: string) =>
    request.post<Todo>(`/todos/${id}/duplicate`).then((d) => ({ data: d })),

  pomodoro: (id: string) =>
    request.post<void>(`/todos/${id}/pomodoro`).then(() => {}),

  delete: (id: string) =>
    request.delete<void>(`/todos/${id}`).then(() => {}),

  bulk: (ids: string[], action: TodoBulkAction, priority?: TodoPriority) =>
    request.post<{ affected: number }>('/todos/bulk', { ids, action, priority }).then((data) => ({ data })),

  // --- Checklist (subtask) items ---

  listItems: (todoId: string, signal?: AbortSignal) =>
    request.get<TodoItem[]>(`/todos/${todoId}/items`, { signal }).then((data) => ({ data })),

  createItem: (todoId: string, content: string) =>
    request.post<TodoItem>(`/todos/${todoId}/items`, { content }).then((d) => ({ data: d })),

  updateItem: (todoId: string, itemId: string, data: { content: string; due_time?: string | null; clear_due_time?: boolean }) =>
    request.put<TodoItem>(`/todos/${todoId}/items/${itemId}`, data).then((d) => ({ data: d })),

  toggleItem: (todoId: string, itemId: string) =>
    request.patch<TodoItem>(`/todos/${todoId}/items/${itemId}/toggle`).then((data) => ({ data })),

  reorderItem: (todoId: string, itemId: string, afterId: string | null) =>
    request.patch<void>(`/todos/${todoId}/items/${itemId}/reorder`, { after_id: afterId }).then(() => {}),

  deleteItem: (todoId: string, itemId: string) =>
    request.delete<void>(`/todos/${todoId}/items/${itemId}`).then(() => {}),

  promoteItem: (todoId: string, itemId: string) =>
    request.post<Todo>(`/todos/${todoId}/items/${itemId}/promote`).then((d) => ({ data: d })),

  // --- Tag associations ---

  getTags: (todoId: string) =>
    request.get<Tag[]>(`/todos/${todoId}/tags`).then((data) => ({ data })),

  replaceTags: (todoId: string, tagIds: string[]) =>
    request.put<void>(`/todos/${todoId}/tags`, { tag_ids: tagIds }).then(() => {}),

  // --- Modification history (audit log) ---

  listActivities: (todoId: string, signal?: AbortSignal) =>
    request.get<TodoActivity[]>(`/todos/${todoId}/activities`, { signal }).then((data) => ({ data })),
}
