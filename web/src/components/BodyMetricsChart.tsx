import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { BodyMetric } from '../types'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// chartData reverses the (newest-first) list into chronological order and drops
// the time portion so the X axis reads as short dates.
function chartData(metrics: BodyMetric[]) {
  return [...metrics]
    .filter((m) => m.weight != null || m.body_fat != null)
    .reverse()
    .map((m) => ({
      date: fmtDate(m.recorded_at),
      weight: m.weight,
      bodyFat: m.body_fat,
    }))
}

export function BodyMetricsChart({ metrics }: { metrics: BodyMetric[] }) {
  const { t } = useTranslation()
  const data = chartData(metrics)
  if (data.length === 0) return null

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
          <YAxis yAxisId="weight" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
          <YAxis yAxisId="bodyFat" orientation="right" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            name={t('fitness.weight')}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            yAxisId="bodyFat"
            type="monotone"
            dataKey="bodyFat"
            name={t('fitness.bodyFat')}
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
