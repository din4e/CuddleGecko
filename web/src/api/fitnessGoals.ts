import { request } from './client'
import type { FitnessGoal, FitnessGoalInput } from '../types'

export const fitnessGoalsApi = {
  list: (signal?: AbortSignal) =>
    request.get<FitnessGoal[]>('/fitness-goals', { signal }).then((data) => ({ data })),

  create: (data: FitnessGoalInput) =>
    request.post<FitnessGoal>('/fitness-goals', data).then((d) => ({ data: d })),

  update: (id: number, data: FitnessGoalInput) =>
    request.put<FitnessGoal>(`/fitness-goals/${id}`, data).then((d) => ({ data: d })),

  delete: (id: number) =>
    request.delete<void>(`/fitness-goals/${id}`).then(() => {}),
}
