import { request } from './client'
import type {
  Workout,
  WorkoutExercise,
  WorkoutExerciseInput,
  WorkoutStats,
  PaginatedData,
  WorkoutListParams,
  WorkoutUpdateInput,
} from '../types'

function buildParams(params?: WorkoutListParams) {
  const out: Record<string, unknown> = { page: params?.page ?? 1, page_size: params?.page_size ?? 50 }
  const keys: (keyof WorkoutListParams)[] = ['status', 'type', 'q', 'date_after', 'date_before', 'sort', 'order']
  for (const key of keys) {
    const value = params?.[key]
    if (value !== undefined && value !== '' && value !== null) {
      out[key] = value
    }
  }
  return out
}

export const workoutsApi = {
  list: (params?: WorkoutListParams, signal?: AbortSignal) =>
    request.get<PaginatedData<Workout>>('/workouts', { params: buildParams(params), signal }).then((data) => ({ data })),

  stats: () =>
    request.get<WorkoutStats>('/workouts/stats').then((data) => ({ data })),

  create: (data: Partial<Workout>) =>
    request.post<Workout>('/workouts', data).then((d) => ({ data: d })),

  update: (id: number, data: WorkoutUpdateInput) =>
    request.put<Workout>(`/workouts/${id}`, data).then((d) => ({ data: d })),

  toggle: (id: number) =>
    request.patch<Workout>(`/workouts/${id}/toggle`).then((data) => ({ data })),

  reorder: (id: number, afterId: number | null) =>
    request.patch<void>(`/workouts/${id}/reorder`, { after_id: afterId }).then(() => {}),

  delete: (id: number) =>
    request.delete<void>(`/workouts/${id}`).then(() => {}),

  // --- Exercise checklist ---

  listExercises: (workoutId: number, signal?: AbortSignal) =>
    request.get<WorkoutExercise[]>(`/workouts/${workoutId}/exercises`, { signal }).then((data) => ({ data })),

  createExercise: (workoutId: number, data: WorkoutExerciseInput) =>
    request.post<WorkoutExercise>(`/workouts/${workoutId}/exercises`, data).then((d) => ({ data: d })),

  updateExercise: (workoutId: number, exerciseId: number, data: WorkoutExerciseInput) =>
    request.put<WorkoutExercise>(`/workouts/${workoutId}/exercises/${exerciseId}`, data).then((d) => ({ data: d })),

  toggleExercise: (workoutId: number, exerciseId: number) =>
    request.patch<WorkoutExercise>(`/workouts/${workoutId}/exercises/${exerciseId}/toggle`).then((data) => ({ data })),

  deleteExercise: (workoutId: number, exerciseId: number) =>
    request.delete<void>(`/workouts/${workoutId}/exercises/${exerciseId}`).then(() => {}),
}
