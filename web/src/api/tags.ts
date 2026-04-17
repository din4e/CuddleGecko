import client from './client'
import type { Tag } from '../types'

export const tagsApi = {
  list: () => client.get<Tag[]>('/tags'),
  create: (data: { name: string; color: string }) => client.post<Tag>('/tags', data),
  update: (id: number, data: Partial<Tag>) => client.put<Tag>(`/tags/${id}`, data),
  delete: (id: number) => client.delete(`/tags/${id}`),
}
