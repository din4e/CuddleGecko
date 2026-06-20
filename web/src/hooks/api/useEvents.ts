import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { eventsApi } from '../../api/events'
import { rootKey } from './keys'
import type { Event, PaginatedData } from '../../types'

const scope = 'events'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

interface ListParams {
  page?: number
  page_size?: number
  start_after?: string
  end_before?: string
}

export function useEventsList(params: ListParams) {
  const { page = 1, page_size = 50, start_after, end_before } = params
  return useQuery<PaginatedData<Event>>({
    queryKey: [...allKey(), 'list', { page, page_size, start_after, end_before }] as const,
    queryFn: ({ signal }) => eventsApi.list({ page, page_size, start_after, end_before }, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Event>) => eventsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Event> }) => eventsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => eventsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}
