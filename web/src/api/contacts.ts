import client from './client'
import type { Contact, Tag, PaginatedData } from '../types'

export const contactsApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; tag_ids?: number[] }) =>
    client.get<PaginatedData<Contact>>('/buddies', { params }),
  create: (data: Partial<Contact>) => client.post<Contact>('/buddies', data),
  get: (id: number) => client.get<Contact>(`/buddies/${id}`),
  update: (id: number, data: Partial<Contact>) => client.put<Contact>(`/buddies/${id}`, data),
  delete: (id: number) => client.delete(`/buddies/${id}`),
  getTags: (id: number) => client.get<Tag[]>(`/buddies/${id}/tags`),
  replaceTags: (id: number, tagIds: number[]) => client.put(`/buddies/${id}/tags`, { tag_ids: tagIds }),
}
