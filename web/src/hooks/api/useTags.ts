import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tagsApi } from '../../api/tags'
import { rootKey } from './keys'
import { invalidateScope } from '@/lib/querySync'
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
    onSuccess: () => invalidateScope(qc, scope),
  })
}

/** Search the workspace's complete label library, loading only visible pages. */
export function useTagSearch(query: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...allKey(), 'list', 'search', query] as const,
    queryFn: ({ pageParam, signal }) => tagsApi.list(pageParam, 50, signal, query).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.page * lastPage.page_size < lastPage.total ? lastPage.page + 1 : undefined,
    enabled,
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Tag> }) => tagsApi.update(id, data),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: () => invalidateScope(qc, scope),
  })
}
