import { request } from './client'
import type { ExerciseLibraryItem, ExerciseLibraryInput } from '../types'

export const exerciseLibraryApi = {
  list: (signal?: AbortSignal) =>
    request.get<ExerciseLibraryItem[]>('/exercise-library', { signal }).then((data) => ({ data })),

  create: (data: ExerciseLibraryInput) =>
    request.post<ExerciseLibraryItem>('/exercise-library', data).then((d) => ({ data: d })),

  update: (id: string, data: ExerciseLibraryInput) =>
    request.put<ExerciseLibraryItem>(`/exercise-library/${id}`, data).then((d) => ({ data: d })),

  delete: (id: string) =>
    request.delete<void>(`/exercise-library/${id}`).then(() => {}),
}
