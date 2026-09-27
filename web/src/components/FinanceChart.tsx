import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent } from './ui/card'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { useTransactionsMonthly, useTransactionsYearly } from '../hooks/api/useTransactions'
import { formatMoney } from '../lib/utils'

type ChartTab = 'yearly' | 'monthly'

interface ChartPoint {
  label: string
  income: number
  expense: number
}

/**
 * Income/expense bar chart with a yearly/monthly toggle. Yearly covers every
 * year with data (the annual-plan view); monthly is the existing rolling
 * 12-month window. Bars use the page's income-green / expense-red semantics.
 */
export function FinanceChart() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ChartTab>('yearly')
  const { data: yearly, isPending: yearlyPending } = useTransactionsYearly()
  const { data: monthly, isPending: monthlyPending } = useTransactionsMonthly(12)

  const points: ChartPoint[] =
    tab === 'yearly'
      ? (yearly ?? []).map((r) => ({ label: r.year, income: r.income, expense: r.expense }))
      : (monthly ?? []).map((r) => ({ label: r.month.slice(2), income: r.income, expense: r.expense }))

  const pending = tab === 'yearly' ? yearlyPending : monthlyPending
  if (pending || points.length === 0) return null

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">{t('finance.chartTitle')}</p>
          <Tabs value={tab} onValueChange={(v) => setTab(v as ChartTab)}>
            <TabsList>
              <TabsTrigger value="yearly">{t('finance.yearly')}</TabsTrigger>
              <TabsTrigger value="monthly">{t('finance.monthly')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-muted-foreground"
                tickFormatter={(v) => formatMoney(Number(v))}
                width={56}
              />
              <Tooltip formatter={(value) => `¥${formatMoney(Number(value))}`} />
              <Legend />
              <Bar dataKey="income" name={t('finance.income')} fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name={t('finance.expense')} fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default FinanceChart
