import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workoutTemplatesApi } from '../../api/workoutTemplates'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type { Workout, WorkoutTemplate, WorkoutTemplateInput } from '../../types'

const scope = 'workout-templates'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useWorkoutTemplates() {
  return useQuery<WorkoutTemplate[]>({
    queryKey: [...allKey(), 'list'] as const,
    queryFn: ({ signal }) => workoutTemplatesApi.list(signal).then((r) => r.data),
  })
}

export function useWorkoutTemplateMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: allKey() })
  const create = useMutation({
    mutationFn: (input: WorkoutTemplateInput) => workoutTemplatesApi.create(input),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkoutTemplateInput }) => workoutTemplatesApi.update(id, data),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const remove = useMutation({
    mutationFn: (id: number) => workoutTemplatesApi.delete(id),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  return { create, update, remove }
}

/** Instantiate a template into a real workout; invalidates workouts scope. */
export function useInstantiateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: number; scheduledAt?: string }): Promise<{ data: Workout }> =>
      workoutTemplatesApi.instantiate(id, scheduledAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts', ...rootKey('workouts').slice(1)] })
    },
    onError: mutationErrorToast,
  })
}
