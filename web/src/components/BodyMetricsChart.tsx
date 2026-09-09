import { useTranslation } from 'react-i18next'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { toBodyChartData, trendDomain, type BodyChartMetric } from '../lib/fitness'

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

// Theme tokens adapt to dark mode automatically (no useIsDarkMode needed).
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
} as const
const TOOLTIP_LABEL = { color: 'var(--foreground)', fontWeight: 600 } as const
const TOOLTIP_ITEM = { color: 'var(--foreground)' } as const

// 10000 → "10k" so the steps axis doesn't eat plot width; smaller values keep
// at most 2 decimals (recharts interpolates ticks between domain bounds).
function fmtTick(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v * 100) / 100)
}

export function BodyMetricsChart({ metrics, metric = 'weight' }: { metrics: Parameters<typeof toBodyChartData>[0]; metric?: BodyChartMetric }) {
  const { t } = useTranslation()
  const data = toBodyChartData(metrics, metric)
  if (data.length === 0) return null

  const dual = metric === 'bp'
  const labels = LABEL_KEYS[metric]
  const domain = trendDomain(data.flatMap((d) => [d.a, dual ? d.b : undefined]))

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bodyMetricFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={A_COLOR} stopOpacity={0.28} />
              <stop offset="100%" stopColor={A_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" minTickGap={24} />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-muted-foreground"
            domain={domain}
            tickFormatter={fmtTick}
            width={44}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
          <Legend />
          {!dual ? (
            <Area
              type="monotone"
              dataKey="a"
              name={t(labels.a)}
              stroke={A_COLOR}
              strokeWidth={2.5}
              fill="url(#bodyMetricFill)"
              dot={{ r: 2.5, strokeWidth: 0, fill: A_COLOR }}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--background)' }}
              connectNulls
            />
          ) : (
            <>
              <Line
                type="monotone"
                dataKey="a"
                name={t(labels.a)}
                stroke={A_COLOR}
                strokeWidth={2.5}
                dot={{ r: 2.5, strokeWidth: 0, fill: A_COLOR }}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--background)' }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="b"
                name={t(labels.b ?? '')}
                stroke={B_COLOR}
                strokeWidth={2.5}
                dot={{ r: 2.5, strokeWidth: 0, fill: B_COLOR }}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--background)' }}
                connectNulls
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
