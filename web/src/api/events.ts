import { request } from './client'
import type { Event, PaginatedData, Tag } from '../types'

export const eventsApi = {
  list: (params?: { page?: number; page_size?: number; start_after?: string; end_before?: string; q?: string }, signal?: AbortSignal) =>
    request.get<PaginatedData<Event>>('/events', { params, signal }).then((data) => ({ data })),

  create: (data: Partial<Event>) =>
    request.post<Event>('/events', data).then((d) => ({ data: d })),

  update: (id: number, data: Partial<Event>) =>
    request.put<Event>(`/events/${id}`, data).then((d) => ({ data: d })),

  delete: (id: number) =>
    request.delete<void>(`/events/${id}`).then(() => {}),

  // --- Workspace labels ---

  getTags: (id: number) =>
    request.get<Tag[]>(`/events/${id}/tags`).then((data) => ({ data })),

  replaceTags: (id: number, tagIds: number[]) =>
    request.put<void>(`/events/${id}/tags`, { tag_ids: tagIds }).then(() => {}),
}
