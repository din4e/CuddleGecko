import { useTranslation } from 'react-i18next'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from './ui/card'
import { useFinanceMortgage } from '../hooks/api/useFinance'
import { formatMoney } from '../lib/utils'

// Mortgage remaining-principal trend. The monthly payment shown in the header
// is the finance-web mortgage table's `monthly` (see CLAUDE.local.md: it is
// the interest component of the real ~7.1k payment) — displayed as pushed.
export function MortgageCard() {
  const { t } = useTranslation()
  const { data, isPending } = useFinanceMortgage()

  if (isPending || !data || data.length === 0) return null

  const latest = data[data.length - 1]
  const points = data.map((m) => ({ label: m.date.slice(0, 10), remaining: m.remaining }))

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{t('finance.mortgage')}</p>
            <p className="text-xl font-bold tabular-nums">¥{formatMoney(latest.remaining)}</p>
          </div>
          <div className="text-xs text-muted-foreground">
            {t('finance.monthlyPayment')} <span className="font-semibold tabular-nums">¥{formatMoney(latest.monthly)}</span>
            <span className="mx-2">·</span>
            {latest.date.slice(0, 10)}
          </div>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" minTickGap={28} />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-muted-foreground"
                domain={['dataMin - 100000', 'dataMax + 100000']}
                tickFormatter={(v) => formatMoney(Number(v))}
                width={56}
              />
              <Tooltip formatter={(value) => `¥${formatMoney(Number(value))}`} />
              <Line dataKey="remaining" name={t('finance.remaining')} stroke="#dc2626" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default MortgageCard
