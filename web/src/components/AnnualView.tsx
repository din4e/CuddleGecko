import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from './ui/card'
import { useTransactionsList } from '../hooks/api/useTransactions'
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

interface YearSection {
  year: string
  incomes: Transaction[]
  expenses: Transaction[]
  catTotals: { category: string; net: number }[]
  net: number
}

/**
 * AnnualView renders the period's annual-plan transactions the finance-web
 * AnnualCard way, grouped by year: each year gets its own block with
 * income/expense item lists, per-category subtotals and a 合计 bar. Grouping
 * matters in the 全部 view — the same yearly recurring items (工资/租金/…)
 * exist once per year, and listing them flat made three years of rows look
 * like triple-counted duplicates.
 *
 * Items come from the list endpoint capped at the handler's page-size max of
 * 100; when the window has more rows than that, per-year blocks render from
 * the fetched page and a truncation hint is shown.
 */
export function AnnualView({ from, to }: { from?: string; to?: string }) {
  const { t } = useTranslation()
  const { data, isPending } = useTransactionsList({ page: 1, page_size: 100, from, to })

  const sections = useMemo<YearSection[]>(() => {
    const items = data?.items ?? []
    const byYear = new Map<string, YearSection>()
    for (const tx of items) {
      const year = tx.date.slice(0, 4)
      let s = byYear.get(year)
      if (!s) {
        s = { year, incomes: [], expenses: [], catTotals: [], net: 0 }
        byYear.set(year, s)
      }
      if (tx.type === 'income') {
        s.incomes.push(tx)
        s.net += tx.amount
      } else {
        s.expenses.push(tx)
        s.net -= tx.amount
      }
    }
    for (const s of byYear.values()) {
      const cats = new Map<string, number>()
      for (const tx of s.incomes) cats.set(tx.category, (cats.get(tx.category) ?? 0) + tx.amount)
      for (const tx of s.expenses) cats.set(tx.category, (cats.get(tx.category) ?? 0) - tx.amount)
      s.catTotals = [...cats.entries()]
        .map(([category, net]) => ({ category, net }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    }
    return [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year))
  }, [data])

  if (isPending) return null
  if (sections.length === 0) return null

  const truncated = (data?.total ?? 0) > (data?.items?.length ?? 0)

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('finance.annualView')}</p>
          <span className="text-xs text-muted-foreground tabular-nums">{from ? from.slice(0, 4) : t('finance.all')}</span>
        </div>

        {sections.map((s) => (
          <div key={s.year} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground tabular-nums">{s.year}</p>
              <span className={`text-xs font-semibold tabular-nums ${s.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {s.net >= 0 ? '+' : '-'}¥{formatMoney(Math.abs(s.net))}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('finance.income')}</p>
                {s.incomes.map((tx) => <TxRow key={tx.id} tx={tx} />)}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('finance.expense')}</p>
                {s.expenses.map((tx) => <TxRow key={tx.id} tx={tx} />)}
              </div>
            </div>

            {s.catTotals.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {s.catTotals.map((c) => (
                  <span key={c.category || '_'} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {c.category || t('finance.uncategorized')}
                    <span className={`ml-1.5 font-semibold tabular-nums ${c.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ¥{formatMoney(c.net)}
                    </span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span className="text-sm font-medium">{t('finance.total')}</span>
              <span className={`text-sm font-bold tabular-nums ${s.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {s.net >= 0 ? '+' : '-'}¥{formatMoney(Math.abs(s.net))}
              </span>
            </div>
          </div>
        ))}

        {truncated && (
          <p className="text-xs text-muted-foreground">{t('finance.truncatedItems', { count: data?.items?.length ?? 0 })}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default AnnualView
