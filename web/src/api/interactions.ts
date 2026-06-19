import { request } from './client'
import type { Interaction, PaginatedData } from '../types'

export const interactionsApi = {
  list: (contactId: number, params?: { page?: number; page_size?: number }) =>
    request.get<PaginatedData<Interaction>>(`/buddies/${contactId}/interactions`, { params }).then((data) => ({ data })),
  create: (contactId: number, data: Partial<Interaction>) =>
    request.post<Interaction>(`/buddies/${contactId}/interactions`, data).then((d) => ({ data: d })),
  update: (id: number, data: Partial<Interaction>) =>
    request.put<Interaction>(`/interactions/${id}`, data).then((d) => ({ data: d })),
  delete: (id: number) => request.delete<void>(`/interactions/${id}`).then(() => {}),
}
