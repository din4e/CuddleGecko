import { request } from './client'
import type { Transaction, TransactionSummary, TransactionTrendPoint, PaginatedData } from '../types'

export const transactionsApi = {
  list: (params?: { page?: number; page_size?: number; type?: string; contact_id?: number }, signal?: AbortSignal) =>
    request.get<PaginatedData<Transaction>>('/transactions', { params, signal }).then((data) => ({ data })),

  summary: () =>
    request.get<TransactionSummary>('/transactions/summary').then((data) => ({ data })),

  trend: (months = 6, signal?: AbortSignal) =>
    request.get<TransactionTrendPoint[]>('/transactions/trend', { params: { months }, signal }).then((data) => ({ data })),

  create: (data: Partial<Transaction>) =>
    request.post<Transaction>('/transactions', data).then((d) => ({ data: d })),

  update: (id: number, data: Partial<Transaction>) =>
    request.put<Transaction>(`/transactions/${id}`, data).then((d) => ({ data: d })),

  delete: (id: number) =>
    request.delete<void>(`/transactions/${id}`).then(() => {}),
}
