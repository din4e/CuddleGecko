import { useQuery } from '@tanstack/react-query'
import { financeApi } from '../../api/finance'
import { rootKey } from './keys'

const scope = 'finance'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const

// Snapshot data is push-driven (finance-web push-cg); a longer staleTime
// avoids refetching the series on every page visit between pushes.
export function useFinanceSnapshots() {
  return useQuery({
    queryKey: [...allKey(), 'snapshots'] as const,
    queryFn: () => financeApi.snapshots().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useFinanceSnapshotAccounts(date?: string) {
  return useQuery({
    queryKey: [...allKey(), 'accounts', { date }] as const,
    queryFn: () => financeApi.snapshotAccounts({ date }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useFinanceMortgage() {
  return useQuery({
    queryKey: [...allKey(), 'mortgage'] as const,
    queryFn: () => financeApi.mortgage().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}
