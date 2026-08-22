import { request } from './client'
import type { Habit } from '../types'

export const habitsApi = {
  list: (archived = false, signal?: AbortSignal) =>
    request.get<Habit[]>('/habits', { params: { archived: archived ? 'true' : undefined }, signal }).then((data) => ({ data })),
  create: (data: Partial<Habit>) =>
    request.post<Habit>('/habits', data).then((d) => ({ data: d })),
  update: (id: number, data: Partial<Habit>) =>
    request.put<Habit>(`/habits/${id}`, data).then((d) => ({ data: d })),
  delete: (id: number) =>
    request.delete<void>(`/habits/${id}`).then(() => {}),
  checkin: (id: number, date?: string) =>
    request.post<{ checked: boolean }>(`/habits/${id}/checkin`, {}, { params: date ? { date } : undefined }).then((data) => ({ data })),
}
