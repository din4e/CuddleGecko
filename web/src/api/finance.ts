import { request } from './client'
import type { FinanceSnapshot, FinanceSnapshotAccount, FinanceMortgage } from '../types'

export const financeApi = {
  snapshots: () => request.get<FinanceSnapshot[]>('/finance/snapshots').then((data) => ({ data })),

  snapshotAccounts: (params?: { date?: string }) =>
    request.get<FinanceSnapshotAccount[]>('/finance/snapshots/accounts', { params }).then((data) => ({ data })),

  mortgage: () => request.get<FinanceMortgage[]>('/finance/mortgage').then((data) => ({ data })),
}
