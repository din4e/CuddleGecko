import { request } from './client'
import type { Workout, WorkoutTemplate, WorkoutTemplateInput } from '../types'

export const workoutTemplatesApi = {
  list: (signal?: AbortSignal) =>
    request.get<WorkoutTemplate[]>('/workout-templates', { signal }).then((data) => ({ data })),

  create: (data: WorkoutTemplateInput) =>
    request.post<WorkoutTemplate>('/workout-templates', data).then((d) => ({ data: d })),

  update: (id: string, data: WorkoutTemplateInput) =>
    request.put<WorkoutTemplate>(`/workout-templates/${id}`, data).then((d) => ({ data: d })),

  delete: (id: string) =>
    request.delete<void>(`/workout-templates/${id}`).then(() => {}),

  /** Create a Workout from this template; optionally scheduled_at. */
  instantiate: (id: string, scheduledAt?: string) =>
    request
      .post<Workout>(`/workout-templates/${id}/instantiate`, scheduledAt ? { scheduled_at: scheduledAt } : {})
      .then((d) => ({ data: d })),
}
