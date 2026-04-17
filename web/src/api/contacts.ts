import client from './client'
import type { Contact, Tag, PaginatedData } from '../types'

export const contactsApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; tag_ids?: number[] }) =>
    client.get<PaginatedData<Contact>>('/contacts', { params }),
  create: (data: Partial<Contact>) => client.post<Contact>('/contacts', data),
  get: (id: number) => client.get<Contact>(`/contacts/${id}`),
  update: (id: number, data: Partial<Contact>) => client.put<Contact>(`/contacts/${id}`, data),
  delete: (id: number) => client.delete(`/contacts/${id}`),
  getTags: (id: number) => client.get<Tag[]>(`/contacts/${id}/tags`),
  replaceTags: (id: number, tagIds: number[]) => client.put(`/contacts/${id}/tags`, { tag_ids: tagIds }),
}
