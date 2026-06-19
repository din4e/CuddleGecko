import { request } from './client'
import type { Transaction, TransactionSummary, PaginatedData } from '../types'

export const transactionApi = {
  list: (params?: { page?: number; page_size?: number; type?: string; contact_id?: number }) =>
    request.get<PaginatedData<Transaction>>('/transactions', { params }).then((data) => ({ data })),

  summary: () =>
    request.get<TransactionSummary>('/transactions/summary').then((data) => ({ data })),

  create: (data: Partial<Transaction>) =>
    request.post<Transaction>('/transactions', data).then((d) => ({ data: d })),

  update: (id: number, data: Partial<Transaction>) =>
    request.put<Transaction>(`/transactions/${id}`, data).then((d) => ({ data: d })),

  delete: (id: number) =>
    request.delete<void>(`/transactions/${id}`).then(() => {}),
}
