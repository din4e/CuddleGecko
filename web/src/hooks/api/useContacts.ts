import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '../../api/contacts'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type { Contact, PaginatedData } from '../../types'

const scope = 'contacts'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

interface ListParams {
  page?: number
  page_size?: number
  search?: string
  tag_ids?: number[]
  signal?: AbortSignal
}

export function useContactsList(params: ListParams) {
  const { page = 1, page_size = 50, search, tag_ids } = params
  return useQuery<PaginatedData<Contact>>({
    queryKey: [...allKey(), 'list', { page, page_size, search, tag_ids }] as const,
    queryFn: ({ signal }) => contactsApi.list({ page, page_size, search, tag_ids }, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Contact>) => contactsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Contact> }) => contactsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => contactsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}
