import { request } from './client'
import type { Contact, Tag, PaginatedData, UpcomingBirthday, Reminder } from '../types'

export const contactsApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; tag_ids?: number[] }, signal?: AbortSignal) =>
    request.get<PaginatedData<Contact>>('/buddies', { params, signal }).then((data) => ({ data })),
  create: (data: Partial<Contact>) => request.post<Contact>('/buddies', data).then((d) => ({ data: d })),
  get: (id: number) => request.get<Contact>(`/buddies/${id}`).then((data) => ({ data })),
  update: (id: number, data: Partial<Contact>) =>
    request.put<Contact>(`/buddies/${id}`, data).then((d) => ({ data: d })),
  delete: (id: number) => request.delete<void>(`/buddies/${id}`).then(() => {}),
  getTags: (id: number) => request.get<Tag[]>(`/buddies/${id}/tags`).then((data) => ({ data })),
  replaceTags: (id: number, tagIds: number[]) =>
    request.put<void>(`/buddies/${id}/tags`, { tag_ids: tagIds }).then(() => {}),
  birthdays: (days = 30, signal?: AbortSignal) =>
    request.get<UpcomingBirthday[]>('/buddies/birthdays', { params: { days }, signal }).then((data) => ({ data })),
  createBirthdayReminder: (id: number) =>
    request.post<Reminder>(`/buddies/${id}/birthday-reminder`, {}).then((d) => ({ data: d })),
}
