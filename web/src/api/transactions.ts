import { request } from './client'
import type {
  Transaction,
  TransactionSummary,
  TransactionMonthly,
  TransactionYearly,
  TransactionCategoryTotal,
  PaginatedData,
  Tag,
} from '../types'

export const transactionsApi = {
  list: (
    params?: { page?: number; page_size?: number; type?: string; contact_id?: string; q?: string; from?: string; to?: string },
    signal?: AbortSignal,
  ) => request.get<PaginatedData<Transaction>>('/transactions', { params, signal }).then((data) => ({ data })),

  summary: (params?: { from?: string; to?: string }) =>
    request.get<TransactionSummary>('/transactions/summary', { params }).then((data) => ({ data })),

  // months = rolling-window mode (dashboard); from/to = explicit-range mode
  // (finance page's year selector). Both optional; from/to wins when present.
  monthly: (params?: { months?: number; from?: string; to?: string }) =>
    request.get<TransactionMonthly[]>('/transactions/monthly', { params }).then((data) => ({ data })),

  yearly: () => request.get<TransactionYearly[]>('/transactions/yearly').then((data) => ({ data })),

  categories: (params?: { from?: string; to?: string }) =>
    request.get<TransactionCategoryTotal[]>('/transactions/categories', { params }).then((data) => ({ data })),

  create: (data: Partial<Transaction>) =>
    request.post<Transaction>('/transactions', data).then((d) => ({ data: d })),

  update: (id: string, data: Partial<Transaction>) =>
    request.put<Transaction>(`/transactions/${id}`, data).then((d) => ({ data: d })),

  delete: (id: string) =>
    request.delete<void>(`/transactions/${id}`).then(() => {}),

  // --- Workspace labels ---

  getTags: (id: string) =>
    request.get<Tag[]>(`/transactions/${id}/tags`).then((data) => ({ data })),

  replaceTags: (id: string, tagIds: string[]) =>
    request.put<void>(`/transactions/${id}/tags`, { tag_ids: tagIds }).then(() => {}),
}
