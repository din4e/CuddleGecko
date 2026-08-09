import { request } from './client'
import type { BodyMetric, BodyMetricInput, BodyMetricSummary, PaginatedData } from '../types'

export const bodyMetricsApi = {
  list: (params?: { page?: number; page_size?: number }, signal?: AbortSignal) =>
    request
      .get<PaginatedData<BodyMetric>>('/body-metrics', {
        params: { page: params?.page ?? 1, page_size: params?.page_size ?? 100 },
        signal,
      })
      .then((data) => ({ data })),

  summary: () =>
    request.get<BodyMetricSummary>('/body-metrics/summary').then((data) => ({ data })),

  create: (data: BodyMetricInput) =>
    request.post<BodyMetric>('/body-metrics', data).then((d) => ({ data: d })),

  update: (id: number, data: BodyMetricInput) =>
    request.put<BodyMetric>(`/body-metrics/${id}`, data).then((d) => ({ data: d })),

  delete: (id: number) =>
    request.delete<void>(`/body-metrics/${id}`).then(() => {}),
}
