import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transactionsApi } from '../../api/transactions'
import { rootKey } from './keys'
import type { Transaction, TransactionSummary, TransactionTrendPoint, PaginatedData } from '../../types'

const scope = 'transactions'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

interface ListParams {
  page?: number
  page_size?: number
  type?: string
  contact_id?: number
}

export function useTransactionsList(params: ListParams) {
  const { page = 1, page_size = 50, type, contact_id } = params
  return useQuery<PaginatedData<Transaction>>({
    queryKey: [...allKey(), 'list', { page, page_size, type, contact_id }] as const,
    queryFn: ({ signal }) => transactionsApi.list({ page, page_size, type, contact_id }, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useTransactionsSummary() {
  return useQuery<TransactionSummary>({
    queryKey: [...allKey(), 'summary'] as const,
    queryFn: () => transactionsApi.summary().then((r) => r.data),
  })
}

export function useTransactionsTrend(months = 6) {
  return useQuery<TransactionTrendPoint[]>({
    queryKey: [...allKey(), 'trend', months] as const,
    queryFn: ({ signal }) => transactionsApi.trend(months, signal).then((r) => r.data),
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Transaction>) => transactionsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => transactionsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
  })
}
