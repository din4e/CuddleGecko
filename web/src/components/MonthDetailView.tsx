import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { useTransactionsList } from '../hooks/api/useTransactions'
import { formatMoney, lastDayOfMonth } from '../lib/utils'
import type { Transaction, TransactionSummary } from '../types'
import { TxRow } from './TransactionRow'

interface DaySection {
  day: string // "YYYY-MM-DD"
  rows: Transaction[]
  net: number
}

/**
 * MonthDetailView renders one month's records grouped BY DAY (the finance-web
 * 按日 way): each section is a day header (MM-DD + weekday + day net subtotal)
 * followed by that day's TxRows, newest day first. Day grouping slices the
 * stored UTC ISO date — the same convention AnnualView's year grouping rests
 * on (dates are stored at the UTC midnight of the entered day).
 */
export function MonthDetailView({
  year,
  month,
  summary,
  onBack,
}: {
  year: string
  month: string
  summary?: TransactionSummary
  onBack: () => void
}) {
  const { t, i18n } = useTranslation()
  // Wire `to` is an INCLUSIVE end date (the backend advances it one day), so a
  // month span must end on the month's last day, not first-of-next-month.
  const from = `${year}-${month}-01`
  const to = lastDayOfMonth(year, month)

  const { data, isPending } = useTransactionsList({ page: 1, page_size: 100, from, to })

  const sections = useMemo<DaySection[]>(() => {
    const byDay = new Map<string, DaySection>()
    for (const tx of data?.items ?? []) {
      const day = tx.date.slice(0, 10)
      let s = byDay.get(day)
      if (!s) {
        s = { day, rows: [], net: 0 }
        byDay.set(day, s)
      }
      s.rows.push(tx)
      s.net += tx.type === 'income' ? tx.amount : -tx.amount
    }
    // The list arrives date-DESC, so insertion order is already newest-first.
    return [...byDay.values()]
  }, [data])

  const monthTitle = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
  })

  // The Z + timeZone:'UTC' pair keeps the weekday on the stored UTC day — a
  // bare parse would shift it for UTC-X local timezones.
  const weekday = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' })

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onBack} aria-label={t('finance.backToMonths')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-medium">{monthTitle}</p>
          </div>
          {summary && (
            <div className="flex items-center gap-3 text-xs tabular-nums">
              <span className="text-green-600">+¥{formatMoney(summary.income)}</span>
              <span className="text-red-600">−¥{formatMoney(summary.expense)}</span>
              <span className={`font-semibold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.balance >= 0 ? '+' : '−'}¥{formatMoney(Math.abs(summary.balance))}
              </span>
            </div>
          )}
        </div>

        {isPending ? null : sections.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('finance.noRecordsThisMonth')}</p>
        ) : (
          <div className="space-y-2">
            {sections.map((s) => (
              <div key={s.day}>
                <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1">
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {s.day.slice(5, 10)} <span className="font-normal">{weekday(s.day)}</span>
                  </span>
                  <span className={`text-xs font-semibold tabular-nums ${s.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {s.net >= 0 ? '+' : '−'}¥{formatMoney(Math.abs(s.net))}
                  </span>
                </div>
                <div className="px-2">
                  {s.rows.map((tx) => <TxRow key={tx.id} tx={tx} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {(data?.total ?? 0) > (data?.items?.length ?? 0) && (
          <p className="text-xs text-muted-foreground">{t('finance.truncatedMonth', { count: data?.items?.length ?? 0 })}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default MonthDetailView
