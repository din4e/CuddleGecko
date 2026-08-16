import { request } from './client'
import type { Reminder, ReminderStatus, PaginatedData } from '../types'

export const remindersApi = {
  list: (status?: ReminderStatus, page = 1, pageSize = 50, signal?: AbortSignal, contactId?: number) =>
    request.get<PaginatedData<Reminder>>('/reminders', { params: { status, page, page_size: pageSize, contact_id: contactId }, signal }).then((data) => ({ data })),
  create: (contactId: number, data: Partial<Reminder>) =>
    request.post<Reminder>(`/buddies/${contactId}/reminders`, data).then((d) => ({ data: d })),
  update: (id: number, data: Partial<Reminder>) =>
    request.put<Reminder>(`/reminders/${id}`, data).then((d) => ({ data: d })),
  delete: (id: number) => request.delete<void>(`/reminders/${id}`).then(() => {}),
}
