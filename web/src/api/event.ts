import client from './client'
import type { Event, PaginatedData } from '../types'

export const eventApi = {
  list: (params?: { page?: number; page_size?: number; start_after?: string; end_before?: string }) =>
    client.get<PaginatedData<Event>>('/events', { params }),

  create: (data: Partial<Event>) =>
    client.post<Event>('/events', data),

  update: (id: number, data: Partial<Event>) =>
    client.put<Event>(`/events/${id}`, data),

  delete: (id: number) =>
    client.delete(`/events/${id}`),
}
