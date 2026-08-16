import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workoutsApi } from '../../api/workouts'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type {
  Workout,
  WorkoutExercise,
  WorkoutExerciseInput,
  WorkoutStats,
  PaginatedData,
  WorkoutListParams,
  WorkoutUpdateInput,
} from '../../types'

const scope = 'workouts'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useWorkoutsList(params: WorkoutListParams = {}) {
  const { page = 1, page_size = 50, ...filters } = params
  const queryKey = [...allKey(), 'list', { ...filters, page, page_size }] as const
  return useQuery<PaginatedData<Workout>>({
    queryKey,
    queryFn: ({ signal }) => workoutsApi.list({ page, page_size, ...filters }, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useWorkoutStats() {
  return useQuery<WorkoutStats>({
    queryKey: [...allKey(), 'stats'] as const,
    queryFn: () => workoutsApi.stats().then((r) => r.data),
  })
}

export function useCreateWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Workout>) => workoutsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useUpdateWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkoutUpdateInput }) => workoutsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useToggleWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => workoutsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useReorderWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, afterId }: { id: number; afterId: number | null }) => workoutsApi.reorder(id, afterId),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useDeleteWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => workoutsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

// --- Exercise checklist ---

const exercisesKey = (workoutId: number) => [...allKey(), 'exercises', workoutId] as const

export function useWorkoutExercises(workoutId: number | null) {
  return useQuery<WorkoutExercise[]>({
    queryKey: [...allKey(), 'exercises', workoutId] as const,
    queryFn: ({ signal }) => workoutsApi.listExercises(workoutId as number, signal).then((r) => r.data),
    enabled: workoutId != null,
  })
}

export function useCreateWorkoutExercise(workoutId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WorkoutExerciseInput) => workoutsApi.createExercise(workoutId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exercisesKey(workoutId) })
      qc.invalidateQueries({ queryKey: allKey() })
    },
    onError: mutationErrorToast,
  })
}

export function useUpdateWorkoutExercise(workoutId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ exerciseId, data }: { exerciseId: number; data: WorkoutExerciseInput }) =>
      workoutsApi.updateExercise(workoutId, exerciseId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: exercisesKey(workoutId) }),
    onError: mutationErrorToast,
  })
}

export function useToggleWorkoutExercise(workoutId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (exerciseId: number) => workoutsApi.toggleExercise(workoutId, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exercisesKey(workoutId) })
      qc.invalidateQueries({ queryKey: allKey() })
    },
    onError: mutationErrorToast,
  })
}

export function useDeleteWorkoutExercise(workoutId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (exerciseId: number) => workoutsApi.deleteExercise(workoutId, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exercisesKey(workoutId) })
      qc.invalidateQueries({ queryKey: allKey() })
    },
    onError: mutationErrorToast,
  })
}
