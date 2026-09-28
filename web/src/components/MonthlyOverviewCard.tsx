import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from './ui/card'
import { useTransactionsMonthlyRange } from '../hooks/api/useTransactions'
import { formatMoney } from '../lib/utils'

/**
 * MonthlyOverviewCard lists one year's per-month income/expense/net rows (the
 * finance-web 月度收支 way). Rows come from the range-mode monthly aggregate —
 * only months with data are returned, newest first. Clicking a row drills into
 * that month via onSelectMonth.
 */
export function MonthlyOverviewCard({ year, onSelectMonth }: { year: string; onSelectMonth: (month: string) => void }) {
  const { t, i18n } = useTranslation()
  const { data, isPending } = useTransactionsMonthlyRange({ from: `${year}-01-01`, to: `${year}-12-31` })

  const months = useMemo(
    () => (data ?? []).slice().sort((a, b) => b.month.localeCompare(a.month)), // newest first
    [data],
  )

  if (isPending) return null

  const monthLabel = (m: string) =>
    new Date(2020, Number(m) - 1, 1).toLocaleDateString(i18n.language, { month: 'numeric' }) // zh: "3月", en: "3"

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('finance.monthlyOverview')}</p>
          <span className="text-xs text-muted-foreground tabular-nums">{year}</span>
        </div>

        {months.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('finance.noMonthlyData')}</p>
        ) : (
          <div>
            {months.map((r) => {
              const net = r.income - r.expense
              return (
                <button
                  key={r.month}
                  type="button"
                  onClick={() => onSelectMonth(r.month.slice(5, 7))}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="w-14 shrink-0 text-sm font-medium tabular-nums">{monthLabel(r.month.slice(5, 7))}</span>
                  <span className="flex-1 truncate text-right text-sm text-green-600 tabular-nums">+¥{formatMoney(r.income)}</span>
                  <span className="flex-1 truncate text-right text-sm text-red-600 tabular-nums">−¥{formatMoney(r.expense)}</span>
                  <span className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {net >= 0 ? '+' : '−'}¥{formatMoney(Math.abs(net))}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default MonthlyOverviewCard
