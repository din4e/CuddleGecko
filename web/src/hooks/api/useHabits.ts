import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { habitsApi } from '../../api/habits'
import { rootKey } from './keys'
import { invalidateScope } from '@/lib/querySync'
import type { Habit } from '../../types'

const scope = 'habits'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useHabitsList(archived = false) {
  return useQuery<Habit[]>({
    queryKey: [...allKey(), 'list', { archived }] as const,
    queryFn: ({ signal }) => habitsApi.list(archived, signal).then((r) => r.data),
  })
}

export function useCreateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Habit>) => habitsApi.create(data),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

export function useUpdateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Habit> }) => habitsApi.update(id, data),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => habitsApi.delete(id),
    onSuccess: () => invalidateScope(qc, scope),
  })
}

export function useCheckinHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, date }: { id: number; date?: string }) => habitsApi.checkin(id, date),
    onSuccess: () => invalidateScope(qc, scope),
  })
}
