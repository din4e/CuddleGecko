import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { toBodyChartData, type BodyChartMetric } from '../lib/fitness'

// metric → i18n label key (the 'a' series; bp renders systolic+diastolic).
const LABEL_KEYS: Record<BodyChartMetric, { a: string; b?: string }> = {
  weight: { a: 'fitness.weight' },
  body_fat: { a: 'fitness.bodyFat' },
  muscle_mass: { a: 'fitness.muscleMass' },
  bp: { a: 'fitness.systolic', b: 'fitness.diastolic' },
  resting_hr: { a: 'fitness.restingHr' },
  sleep_hours: { a: 'fitness.sleepHours' },
  steps: { a: 'fitness.steps' },
  energy: { a: 'fitness.energy' },
  mood: { a: 'fitness.mood' },
}

const B_COLOR = '#3b82f6'
const A_COLOR = '#f97316'

export function BodyMetricsChart({ metrics, metric = 'weight' }: { metrics: Parameters<typeof toBodyChartData>[0]; metric?: BodyChartMetric }) {
  const { t } = useTranslation()
  const data = toBodyChartData(metrics, metric)
  if (data.length === 0) return null

  const dual = metric === 'bp'
  const labels = LABEL_KEYS[metric]

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="a"
            name={t(labels.a)}
            stroke={A_COLOR}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          {dual && (
            <Line
              type="monotone"
              dataKey="b"
              name={t(labels.b ?? '')}
              stroke={B_COLOR}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
