import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workoutsApi } from '../../api/workouts'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import { invalidateScope } from '@/lib/querySync'
import type {
  Workout,
  WorkoutExercise,
  WorkoutExerciseInput,
  WorkoutStats,
  WorkoutHistoryBucket,
  WorkoutPR,
  SetLog,
  SetLogInput,
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
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

export function useUpdateWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: WorkoutUpdateInput }) => workoutsApi.update(id, data),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

export function useToggleWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workoutsApi.toggle(id),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

export function useReorderWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, afterId }: { id: string; afterId: string | null }) => workoutsApi.reorder(id, afterId),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

export function useDeleteWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workoutsApi.delete(id),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

// --- Exercise checklist ---

const exercisesKey = (workoutId: string) => [...allKey(), 'exercises', workoutId] as const

export function useWorkoutExercises(workoutId: string | null) {
  return useQuery<WorkoutExercise[]>({
    queryKey: [...allKey(), 'exercises', workoutId] as const,
    queryFn: ({ signal }) => workoutsApi.listExercises(workoutId!, signal).then((r) => r.data),
    enabled: workoutId != null,
  })
}

export function useCreateWorkoutExercise(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: WorkoutExerciseInput) => workoutsApi.createExercise(workoutId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exercisesKey(workoutId) })
      invalidateScope(qc, scope)
    },
    onError: mutationErrorToast,
  })
}

export function useUpdateWorkoutExercise(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ exerciseId, data }: { exerciseId: string; data: WorkoutExerciseInput }) =>
      workoutsApi.updateExercise(workoutId, exerciseId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: exercisesKey(workoutId) }),
    onError: mutationErrorToast,
  })
}

export function useToggleWorkoutExercise(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (exerciseId: string) => workoutsApi.toggleExercise(workoutId, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exercisesKey(workoutId) })
      invalidateScope(qc, scope)
    },
    onError: mutationErrorToast,
  })
}

export function useDeleteWorkoutExercise(workoutId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (exerciseId: string) => workoutsApi.deleteExercise(workoutId, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exercisesKey(workoutId) })
      invalidateScope(qc, scope)
    },
    onError: mutationErrorToast,
  })
}

// --- History / PRs / set logs ---

export function useWorkoutHistory(bucket: 'week' | 'month' = 'week', limit = 12) {
  return useQuery<WorkoutHistoryBucket[]>({
    queryKey: [...allKey(), 'history', bucket, limit] as const,
    queryFn: () => workoutsApi.history(bucket, limit).then((r) => r.data),
  })
}

export function useWorkoutPrs() {
  return useQuery<WorkoutPR[]>({
    queryKey: [...allKey(), 'prs'] as const,
    queryFn: () => workoutsApi.prs().then((r) => r.data),
  })
}

const setsKey = (workoutId: string, exerciseId: string) => [...allKey(), 'sets', workoutId, exerciseId] as const

export function useSetLogs(workoutId: string, exerciseId: string, enabled: boolean) {
  return useQuery<SetLog[]>({
    queryKey: setsKey(workoutId, exerciseId),
    queryFn: ({ signal }) => workoutsApi.listSets(workoutId, exerciseId, signal).then((r) => r.data),
    enabled,
  })
}

export function useSetLogMutations(workoutId: string, exerciseId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: setsKey(workoutId, exerciseId) })
    // PRs derive from set logs, and the workout card shows progress.
    qc.invalidateQueries({ queryKey: [...allKey(), 'prs'] })
    invalidateScope(qc, scope)
  }
  const create = useMutation({
    mutationFn: (input: SetLogInput) => workoutsApi.createSet(workoutId, exerciseId, input),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const update = useMutation({
    mutationFn: ({ setId, data }: { setId: string; data: SetLogInput }) =>
      workoutsApi.updateSet(workoutId, exerciseId, setId, data),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  const remove = useMutation({
    mutationFn: (setId: string) => workoutsApi.deleteSet(workoutId, exerciseId, setId),
    onSuccess: invalidate,
    onError: mutationErrorToast,
  })
  return { create, update, remove }
}

export function useReplaceWorkoutTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, tagIds }: { id: string; tagIds: string[] }) => workoutsApi.replaceTags(id, tagIds),
    onSuccess: () => invalidateScope(qc, scope),
  })
}
