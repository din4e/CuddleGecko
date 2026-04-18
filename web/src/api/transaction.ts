import client from './client'
import type { Transaction, TransactionSummary, PaginatedData } from '../types'

export const transactionApi = {
  list: (params?: { page?: number; page_size?: number; type?: string; contact_id?: number }) =>
    client.get<PaginatedData<Transaction>>('/transactions', { params }),

  summary: () =>
    client.get<TransactionSummary>('/transactions/summary'),

  create: (data: Partial<Transaction>) =>
    client.post<Transaction>('/transactions', data),

  update: (id: number, data: Partial<Transaction>) =>
    client.put<Transaction>(`/transactions/${id}`, data),

  delete: (id: number) =>
    client.delete(`/transactions/${id}`),
}
