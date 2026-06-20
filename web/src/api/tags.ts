import { request } from './client'
import type { Tag, PaginatedData } from '../types'

export const tagsApi = {
  list: (page = 1, pageSize = 50, signal?: AbortSignal) =>
    request.get<PaginatedData<Tag>>('/tags', { params: { page, page_size: pageSize }, signal }).then((data) => ({ data })),
  create: (data: { name: string; color: string }) =>
    request.post<Tag>('/tags', data).then((d) => ({ data: d })),
  update: (id: number, data: Partial<Tag>) =>
    request.put<Tag>(`/tags/${id}`, data).then((d) => ({ data: d })),
  delete: (id: number) => request.delete<void>(`/tags/${id}`).then(() => {}),
}
