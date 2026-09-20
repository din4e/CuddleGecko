import { useTranslation } from 'react-i18next'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from 'recharts'
import { Dumbbell } from 'lucide-react'
import { toBodyChartData, trendDomain, type BodyChartMetric, type BodyChartPoint } from '../lib/fitness'

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
// Training-day marker: green ring on the reading taken on a workout day.
const TRAINED_COLOR = '#10b981'

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

interface TooltipEntry {
  dataKey?: string | number
  value?: number | string
  color?: string
  payload?: BodyChartPoint
}

/** Default tooltip plus the same-day workout names when the reading falls on a training day. */
function ChartTooltip({ active, payload, label, labelKeys }: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  labelKeys: { a: string; b?: string }
}) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const trained = payload[0]?.payload?.trained
  return (
    <div className="max-w-64 rounded-lg p-2 shadow-md" style={TOOLTIP_STYLE}>
      <p style={TOOLTIP_LABEL}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5" style={TOOLTIP_ITEM}>
          {p.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />}
          <span className="min-w-0 break-words">
            {t(p.dataKey === 'b' ? (labelKeys.b ?? '') : labelKeys.a)}: {String(p.value)}
          </span>
        </p>
      ))}
      {trained?.length ? (
        <p className="mt-1 flex items-start gap-1" style={{ ...TOOLTIP_ITEM, color: TRAINED_COLOR }}>
          <Dumbbell className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{t('fitness.trainedOnDay')}: {trained.join(' · ')}</span>
        </p>
      ) : null}
    </div>
  )
}

export interface BodyMetricsChartProps {
  metrics: Parameters<typeof toBodyChartData>[0]
  metric?: BodyChartMetric
  /** day key ("2026-08-14") → same-day workout names, drawn as chart markers */
  trainedDays?: Map<string, string[]>
  /** click on a training-day marker → jump to the workouts section */
  onWorkoutDayClick?: (day: string) => void
}

export function BodyMetricsChart({ metrics, metric = 'weight', trainedDays, onWorkoutDayClick }: BodyMetricsChartProps) {
  const { t } = useTranslation()
  const data = toBodyChartData(metrics, metric, trainedDays)
  if (data.length === 0) return null

  const dual = metric === 'bp'
  const labels = LABEL_KEYS[metric]
  const domain = trendDomain(data.flatMap((d) => [d.a, dual ? d.b : undefined]))
  const markerPoints = data.filter((d) => d.trained?.length && d.a != null)

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
          <Tooltip content={<ChartTooltip labelKeys={labels} />} />
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
          {markerPoints.map((p, i) => (
            <ReferenceDot
              key={`${p.day}-${i}`}
              x={p.date}
              y={p.a as number}
              r={5}
              fill="var(--background)"
              stroke={TRAINED_COLOR}
              strokeWidth={2}
              className={onWorkoutDayClick ? 'cursor-pointer' : undefined}
              onClick={() => onWorkoutDayClick?.(p.day)}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
