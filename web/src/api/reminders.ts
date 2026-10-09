import { request } from './client'
import type { Reminder, ReminderStatus, PaginatedData, Tag } from '../types'

export const remindersApi = {
  list: (status?: ReminderStatus, page = 1, pageSize = 50, signal?: AbortSignal, contactId?: string) =>
    request.get<PaginatedData<Reminder>>('/reminders', { params: { status, page, page_size: pageSize, contact_id: contactId }, signal }).then((data) => ({ data })),
  create: (contactId: string, data: Partial<Reminder>) =>
    request.post<Reminder>(`/buddies/${contactId}/reminders`, data).then((d) => ({ data: d })),
  update: (id: string, data: Partial<Reminder>) =>
    request.put<Reminder>(`/reminders/${id}`, data).then((d) => ({ data: d })),
  delete: (id: string) => request.delete<void>(`/reminders/${id}`).then(() => {}),

  // --- Workspace labels ---

  getTags: (id: string) =>
    request.get<Tag[]>(`/reminders/${id}/tags`).then((data) => ({ data })),

  replaceTags: (id: string, tagIds: string[]) =>
    request.put<void>(`/reminders/${id}/tags`, { tag_ids: tagIds }).then(() => {}),
}
