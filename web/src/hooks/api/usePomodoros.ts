import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pomodorosApi } from '../../api/pomodoros'
import { rootKey } from './keys'

const scope = 'pomodoros'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function usePomodoroSummary() {
  return useQuery({
    queryKey: [...allKey(), 'summary'] as const,
    queryFn: ({ signal }) => pomodorosApi.summary(signal).then((r) => r.data),
    refetchInterval: 30_000,
  })
}

export function useRecordPomodoro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { duration_seconds: number; kind?: string; todo_id?: number | null; completed?: boolean }) =>
      pomodorosApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}
