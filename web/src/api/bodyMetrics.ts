import { request } from './client'
import type { BodyMetric, BodyMetricInput, BodyMetricSummary, PaginatedData } from '../types'

export const bodyMetricsApi = {
  list: (
    params?: { page?: number; page_size?: number; date_after?: string; date_before?: string },
    signal?: AbortSignal,
  ) => {
    const out: Record<string, unknown> = { page: params?.page ?? 1, page_size: params?.page_size ?? 100 }
    if (params?.date_after) out.date_after = params.date_after
    if (params?.date_before) out.date_before = params.date_before
    return request.get<PaginatedData<BodyMetric>>('/body-metrics', { params: out, signal }).then((data) => ({ data }))
  },

  summary: () =>
    request.get<BodyMetricSummary>('/body-metrics/summary').then((data) => ({ data })),

  create: (data: BodyMetricInput) =>
    request.post<BodyMetric>('/body-metrics', data).then((d) => ({ data: d })),

  update: (id: number, data: BodyMetricInput) =>
    request.put<BodyMetric>(`/body-metrics/${id}`, data).then((d) => ({ data: d })),

  delete: (id: number) =>
    request.delete<void>(`/body-metrics/${id}`).then(() => {}),
}
