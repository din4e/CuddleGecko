import client from './client'
import type { Interaction, PaginatedData } from '../types'

export const interactionsApi = {
  list: (contactId: number, params?: { page?: number; page_size?: number }) =>
    client.get<PaginatedData<Interaction>>(`/buddies/${contactId}/interactions`, { params }),
  create: (contactId: number, data: Partial<Interaction>) =>
    client.post<Interaction>(`/buddies/${contactId}/interactions`, data),
  update: (id: number, data: Partial<Interaction>) => client.put<Interaction>(`/interactions/${id}`, data),
  delete: (id: number) => client.delete(`/interactions/${id}`),
}
