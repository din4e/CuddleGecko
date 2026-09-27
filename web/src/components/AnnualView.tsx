import { useTranslation } from 'react-i18next'
import { Card, CardContent } from './ui/card'
import { useTransactionsCategoryTotals, useTransactionsList } from '../hooks/api/useTransactions'
import { formatMoney } from '../lib/utils'
import type { Transaction } from '../types'

// Category chip colors, mirroring finance-web's AnnualCard: 我的 → brand green
// family, 爸妈 → amber family (money-from-parents), unknown → muted. Matches
// the income-circle palette already used across the finance page.
const categoryChipClass: Record<string, string> = {
  我的: 'bg-green-100 text-green-600 dark:bg-green-950',
  爸妈: 'bg-amber-100 text-amber-600 dark:bg-amber-950',
}

function chipClass(category: string): string {
  return categoryChipClass[category] ?? 'bg-muted text-muted-foreground'
}

function TxRow({ tx }: { tx: Transaction }) {
  return (
    <div className="flex items-center gap-2 py-1.5" title={tx.category ? `${tx.category} · ¥${formatMoney(tx.amount)}` : `¥${formatMoney(tx.amount)}`}>
      {tx.category && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none ${chipClass(tx.category)}`}>{tx.category}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{tx.title}</span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
        {tx.type === 'income' ? '+' : '-'}¥{formatMoney(tx.amount)}
      </span>
    </div>
  )
}

/**
 * AnnualView renders one period's transactions the finance-web AnnualCard way:
 * income/expense item lists with category chips, per-category subtotals, and a
 * grand 合计 bar. Items come from the plain list endpoint (capped at the
 * handler's page-size max of 100 — current data is a handful of rows per
 * year); subtotals and the total come from the server-side category aggregate,
 * so they stay exact regardless of the item cap.
 */
export function AnnualView({ from, to }: { from?: string; to?: string }) {
  const { t } = useTranslation()
  const { data, isPending } = useTransactionsList({ page: 1, page_size: 100, from, to })
  const { data: categories } = useTransactionsCategoryTotals({ from, to })

  if (isPending) return null

  const items = data?.items ?? []
  const catTotals = categories ?? []
  const incomes = items.filter((tx) => tx.type === 'income')
  const expenses = items.filter((tx) => tx.type !== 'income')

  const totalIncome = catTotals.reduce((s, c) => s + c.income, 0)
  const totalExpense = catTotals.reduce((s, c) => s + c.expense, 0)
  const net = totalIncome - totalExpense

  if (items.length === 0) return null

  const periodLabel = from ? from.slice(0, 4) : t('finance.all')

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('finance.annualView')}</p>
          <span className="text-xs text-muted-foreground tabular-nums">{periodLabel}</span>
        </div>

        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('finance.income')}</p>
            {incomes.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('finance.expense')}</p>
            {expenses.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </div>
        </div>

        {catTotals.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {catTotals.map((c) => {
              const catNet = c.income - c.expense
              return (
                <span key={c.category || '_'} className="rounded-md bg-muted px-2 py-1 text-xs">
                  {c.category || t('finance.uncategorized')}
                  <span className={`ml-1.5 font-semibold tabular-nums ${catNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ¥{formatMoney(catNet)}
                  </span>
                </span>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-sm font-medium">{t('finance.total')}</span>
          <span className={`text-sm font-bold tabular-nums ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {net >= 0 ? '+' : '-'}¥{formatMoney(Math.abs(net))}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default AnnualView
