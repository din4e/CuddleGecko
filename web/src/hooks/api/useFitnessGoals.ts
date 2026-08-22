import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fitnessGoalsApi } from '../../api/fitnessGoals'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type { FitnessGoal, FitnessGoalInput } from '../../types'

const scope = 'fitness-goals'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useFitnessGoals() {
  return useQuery<FitnessGoal[]>({
    queryKey: [...allKey(), 'list'] as const,
    queryFn: ({ signal }) => fitnessGoalsApi.list(signal).then((r) => r.data),
  })
}

export function useFitnessGoalMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: allKey() })
  const create = useMutation({
    mutationFn: (input: FitnessGoalInput) => fitnessGoalsApi.create(input),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FitnessGoalInput }) => fitnessGoalsApi.update(id, data),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const remove = useMutation({
    mutationFn: (id: number) => fitnessGoalsApi.delete(id),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  return { create, update, remove }
}
