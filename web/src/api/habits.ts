import { request } from './client'
import type { Habit, Tag } from '../types'

export const habitsApi = {
  list: (archived = false, signal?: AbortSignal) =>
    request.get<Habit[]>('/habits', { params: { archived: archived ? 'true' : undefined }, signal }).then((data) => ({ data })),
  create: (data: Partial<Habit>) =>
    request.post<Habit>('/habits', data).then((d) => ({ data: d })),
  update: (id: string, data: Partial<Habit>) =>
    request.put<Habit>(`/habits/${id}`, data).then((d) => ({ data: d })),
  delete: (id: string) =>
    request.delete<void>(`/habits/${id}`).then(() => {}),

  // --- Workspace labels ---

  getTags: (id: string) =>
    request.get<Tag[]>(`/habits/${id}/tags`).then((data) => ({ data })),

  replaceTags: (id: string, tagIds: string[]) =>
    request.put<void>(`/habits/${id}/tags`, { tag_ids: tagIds }).then(() => {}),
  checkin: (id: string, date?: string) =>
    request.post<{ checked: boolean }>(`/habits/${id}/checkin`, {}, { params: date ? { date } : undefined }).then((data) => ({ data })),
}
