import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tagsApi } from '../../api/tags'
import { rootKey } from './keys'
import type { Tag, PaginatedData } from '../../types'

const scope = 'tags'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useTagsList(page = 1, pageSize = 50) {
  return useQuery<PaginatedData<Tag>>({
    queryKey: [...allKey(), 'list', { page, page_size: pageSize }] as const,
    queryFn: ({ signal }) => tagsApi.list(page, pageSize, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color: string }) => tagsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Tag> }) => tagsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}
