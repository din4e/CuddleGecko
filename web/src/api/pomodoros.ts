import { request } from './client'
import type { PomodoroSession, PomodoroSummary } from '../types'

export const pomodorosApi = {
  list: (signal?: AbortSignal) =>
    request.get<PomodoroSession[]>('/pomodoros', { signal }).then((data) => ({ data })),
  create: (data: { duration_seconds: number; kind?: string; todo_id?: number | null; completed?: boolean }) =>
    request.post<PomodoroSession>('/pomodoros', data).then((d) => ({ data: d })),
  summary: (signal?: AbortSignal) =>
    request.get<PomodoroSummary>('/pomodoros/summary', { signal }).then((data) => ({ data })),
}
