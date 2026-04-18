import client from './client'
import type { Reminder, ReminderStatus } from '../types'

export const remindersApi = {
  list: (status?: ReminderStatus) => client.get<Reminder[]>('/reminders', { params: { status } }),
  create: (contactId: number, data: Partial<Reminder>) =>
    client.post<Reminder>(`/buddies/${contactId}/reminders`, data),
  update: (id: number, data: Partial<Reminder>) => client.put<Reminder>(`/reminders/${id}`, data),
  delete: (id: number) => client.delete(`/reminders/${id}`),
}
