import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transactionsApi } from '../../api/transactions'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import type {
  Transaction,
  TransactionSummary,
  TransactionMonthly,
  TransactionYearly,
  TransactionCategoryTotal,
  PaginatedData,
} from '../../types'

const scope = 'transactions'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

interface DateRange {
  from?: string
  to?: string
}

interface ListParams extends DateRange {
  page?: number
  page_size?: number
  type?: string
  contact_id?: number
  q?: string
}

export function useTransactionsList(params: ListParams) {
  const { page = 1, page_size = 50, type, contact_id, q, from, to } = params
  return useQuery<PaginatedData<Transaction>>({
    queryKey: [...allKey(), 'list', { page, page_size, type, contact_id, q, from, to }] as const,
    queryFn: ({ signal }) => transactionsApi.list({ page, page_size, type, contact_id, q, from, to }, signal).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useTransactionsSummary(params?: DateRange) {
  const { from, to } = params ?? {}
  return useQuery<TransactionSummary>({
    queryKey: [...allKey(), 'summary', { from, to }] as const,
    queryFn: () => transactionsApi.summary({ from, to }).then((r) => r.data),
  })
}

export function useTransactionsMonthly(months = 6) {
  return useQuery<TransactionMonthly[]>({
    queryKey: [...allKey(), 'monthly', months] as const,
    queryFn: () => transactionsApi.monthly(months).then((r) => r.data),
  })
}

export function useTransactionsYearly() {
  return useQuery<TransactionYearly[]>({
    queryKey: [...allKey(), 'yearly'] as const,
    queryFn: () => transactionsApi.yearly().then((r) => r.data),
  })
}

export function useTransactionsCategoryTotals(params?: DateRange) {
  const { from, to } = params ?? {}
  return useQuery<TransactionCategoryTotal[]>({
    queryKey: [...allKey(), 'categories', { from, to }] as const,
    queryFn: () => transactionsApi.categories({ from, to }).then((r) => r.data),
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Transaction>) => transactionsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => transactionsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: allKey() }),
    onError: mutationErrorToast,
  })
}
