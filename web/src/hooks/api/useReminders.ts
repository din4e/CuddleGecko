import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { remindersApi } from '../../api/reminders'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type { Reminder, ReminderStatus, PaginatedData } from '../../types'

const scope = 'reminders'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useRemindersList(status: ReminderStatus | '', page = 1, pageSize = 50) {
  return useQuery<PaginatedData<Reminder>>({
    queryKey: [...allKey(), 'list', { status, page, page_size: pageSize }] as const,
    queryFn: ({ signal }) => remindersApi.list(status || undefined, page, pageSize, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useCreateReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: number; data: Partial<Reminder> }) =>
      remindersApi.create(contactId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useUpdateReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Reminder> }) => remindersApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => remindersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}
