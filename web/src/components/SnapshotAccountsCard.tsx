import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useFinanceSnapshotAccounts, useFinanceSnapshots } from '../hooks/api/useFinance'
import { formatMoney } from '../lib/utils'
import type { FinanceSnapshotAccount } from '../types'

// finance-web's account detail for one snapshot day. Debt-side groups
// (信用卡/长期负债) carry available = −欠款/−剩余本金, so they display the
// negated value in red; asset groups show available in green.
const DEBT_GROUPS = new Set(['信用卡', '长期负债'])

const GROUP_ORDER = ['流通', '非流通', '锁住', '信用卡', '长期负债']

function AccountRow({ acc }: { acc: FinanceSnapshotAccount }) {
  const isDebt = DEBT_GROUPS.has(acc.type)
  const shown = isDebt ? -acc.available : acc.available
  return (
    <div className="flex items-center justify-between py-1.5" title={acc.note || undefined}>
      <span className="min-w-0 flex-1 truncate text-sm">{acc.name}</span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${isDebt ? 'text-red-600' : 'text-green-600'}`}>
        ¥{formatMoney(shown)}
      </span>
    </div>
  )
}

export function SnapshotAccountsCard() {
  const { t } = useTranslation()
  const { data: snapshots } = useFinanceSnapshots()
  const [date, setDate] = useState<string>('') // '' = latest
  const { data: accounts, isPending } = useFinanceSnapshotAccounts(date || undefined)

  const dates = useMemo(() => (snapshots ?? []).map((s) => s.date.slice(0, 10)).reverse(), [snapshots]) // newest first

  const groups = useMemo(() => {
    const byType = new Map<string, FinanceSnapshotAccount[]>()
    for (const acc of accounts ?? []) {
      const list = byType.get(acc.type) ?? []
      list.push(acc)
      byType.set(acc.type, list)
    }
    return [...byType.entries()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a[0])
      const ib = GROUP_ORDER.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [accounts])

  if (!snapshots || snapshots.length === 0) return null
  if (isPending || !accounts || accounts.length === 0) return null

  const shownDate = date || dates[0]

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('finance.accountDetail')}</p>
          <Select value={date} onValueChange={(v) => setDate(String(v))}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dates.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {groups.map(([type, accs]) => (
            <div key={type}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {type} <span className="font-normal">({accs.length})</span>
              </p>
              {accs.map((acc) => <AccountRow key={acc.name + acc.date} acc={acc} />)}
            </div>
          ))}
        </div>

        <p className="text-right text-xs text-muted-foreground tabular-nums">{t('finance.snapshotOf', { date: shownDate })}</p>
      </CardContent>
    </Card>
  )
}

export default SnapshotAccountsCard
