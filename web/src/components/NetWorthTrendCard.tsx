import { useTranslation } from 'react-i18next'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent } from './ui/card'
import { useFinanceSnapshots } from '../hooks/api/useFinance'
import { formatMoney } from '../lib/utils'

// finance-web's hero content: the net-worth series. Assets amber, liabilities
// red, net worth green — the page's income/expense semantic colors.
export function NetWorthTrendCard() {
  const { t } = useTranslation()
  const { data, isPending } = useFinanceSnapshots()

  if (isPending || !data || data.length === 0) return null

  const latest = data[data.length - 1]
  const points = data.map((s) => ({
    label: s.date.slice(0, 10),
    assets: s.assets,
    debt: s.debt,
    net: s.net_worth,
  }))

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {t('finance.netWorth')} · {t('finance.latestSnapshot')} {latest.date.slice(0, 10)}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${latest.net_worth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {latest.net_worth >= 0 ? '' : '-'}¥{formatMoney(Math.abs(latest.net_worth))}
            </p>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              {t('finance.totalAssets')} <span className="font-semibold text-amber-600 tabular-nums">¥{formatMoney(latest.assets)}</span>
            </span>
            <span>
              {t('finance.totalLiabilities')} <span className="font-semibold text-red-600 tabular-nums">¥{formatMoney(latest.debt)}</span>
            </span>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" minTickGap={28} />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-muted-foreground"
                tickFormatter={(v) => formatMoney(Number(v))}
                width={56}
              />
              <Tooltip formatter={(value) => `¥${formatMoney(Number(value))}`} />
              <Legend />
              <Line dataKey="assets" name={t('finance.totalAssets')} stroke="#d97706" dot={false} strokeWidth={2} />
              <Line dataKey="debt" name={t('finance.totalLiabilities')} stroke="#dc2626" dot={false} strokeWidth={2} />
              <Line dataKey="net" name={t('finance.netWorth')} stroke="#16a34a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default NetWorthTrendCard
