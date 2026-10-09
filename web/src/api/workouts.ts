import { request } from './client'
import type {
  Workout,
  WorkoutExercise,
  WorkoutExerciseInput,
  WorkoutStats,
  PaginatedData,
  WorkoutListParams,
  WorkoutUpdateInput,
  WorkoutHistoryBucket,
  WorkoutPR,
  SetLog,
  SetLogInput,
  Tag,
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

  history: (bucket: 'week' | 'month' = 'week', limit = 12) =>
    request
      .get<WorkoutHistoryBucket[]>('/workouts/history', { params: { bucket, limit } })
      .then((data) => ({ data })),

  prs: () =>
    request.get<WorkoutPR[]>('/workouts/prs').then((data) => ({ data })),

  create: (data: Partial<Workout>) =>
    request.post<Workout>('/workouts', data).then((d) => ({ data: d })),

  update: (id: string, data: WorkoutUpdateInput) =>
    request.put<Workout>(`/workouts/${id}`, data).then((d) => ({ data: d })),

  toggle: (id: string) =>
    request.patch<Workout>(`/workouts/${id}/toggle`).then((data) => ({ data })),

  reorder: (id: string, afterId: string | null) =>
    request.patch<void>(`/workouts/${id}/reorder`, { after_id: afterId }).then(() => {}),

  delete: (id: string) =>
    request.delete<void>(`/workouts/${id}`).then(() => {}),

  // --- Exercise checklist ---

  listExercises: (workoutId: string, signal?: AbortSignal) =>
    request.get<WorkoutExercise[]>(`/workouts/${workoutId}/exercises`, { signal }).then((data) => ({ data })),

  createExercise: (workoutId: string, data: WorkoutExerciseInput) =>
    request.post<WorkoutExercise>(`/workouts/${workoutId}/exercises`, data).then((d) => ({ data: d })),

  updateExercise: (workoutId: string, exerciseId: string, data: WorkoutExerciseInput) =>
    request.put<WorkoutExercise>(`/workouts/${workoutId}/exercises/${exerciseId}`, data).then((d) => ({ data: d })),

  toggleExercise: (workoutId: string, exerciseId: string) =>
    request.patch<WorkoutExercise>(`/workouts/${workoutId}/exercises/${exerciseId}/toggle`).then((data) => ({ data })),

  deleteExercise: (workoutId: string, exerciseId: string) =>
    request.delete<void>(`/workouts/${workoutId}/exercises/${exerciseId}`).then(() => {}),

  // --- Set logs (per-exercise, PRs derive from these) ---

  listSets: (workoutId: string, exerciseId: string, signal?: AbortSignal) =>
    request
      .get<SetLog[]>(`/workouts/${workoutId}/exercises/${exerciseId}/sets`, { signal })
      .then((data) => ({ data })),

  createSet: (workoutId: string, exerciseId: string, data: SetLogInput) =>
    request
      .post<SetLog>(`/workouts/${workoutId}/exercises/${exerciseId}/sets`, data)
      .then((d) => ({ data: d })),

  updateSet: (workoutId: string, exerciseId: string, setId: string, data: SetLogInput) =>
    request
      .put<SetLog>(`/workouts/${workoutId}/exercises/${exerciseId}/sets/${setId}`, data)
      .then((d) => ({ data: d })),

  deleteSet: (workoutId: string, exerciseId: string, setId: string) =>
    request.delete<void>(`/workouts/${workoutId}/exercises/${exerciseId}/sets/${setId}`).then(() => {}),

  // --- Workspace labels ---

  getTags: (id: string) =>
    request.get<Tag[]>(`/workouts/${id}/tags`).then((data) => ({ data })),

  replaceTags: (id: string, tagIds: string[]) =>
    request.put<void>(`/workouts/${id}/tags`, { tag_ids: tagIds }).then(() => {}),
}
