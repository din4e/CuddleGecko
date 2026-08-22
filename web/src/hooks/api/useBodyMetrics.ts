import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bodyMetricsApi } from '../../api/bodyMetrics'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type { BodyMetric, BodyMetricInput, BodyMetricSummary, PaginatedData } from '../../types'

const scope = 'body-metrics'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

export function useBodyMetricsList(dateAfter?: string) {
  return useQuery<PaginatedData<BodyMetric>>({
    queryKey: [...allKey(), 'list', dateAfter ?? 'all'] as const,
    queryFn: ({ signal }) =>
      bodyMetricsApi.list({ page_size: 100000, ...(dateAfter ? { date_after: dateAfter } : {}) }, signal).then((r) => r.data),
  })
}

export function useBodyMetricSummary() {
  return useQuery<BodyMetricSummary>({
    queryKey: [...allKey(), 'summary'] as const,
    queryFn: () => bodyMetricsApi.summary().then((r) => r.data),
  })
}

export function useCreateBodyMetric() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BodyMetricInput) => bodyMetricsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useUpdateBodyMetric() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: BodyMetricInput }) => bodyMetricsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useDeleteBodyMetric() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bodyMetricsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}
