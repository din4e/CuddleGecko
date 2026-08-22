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
import { useWorkoutHistory } from '../hooks/api/useWorkouts'
import { toHistoryChartData } from '../lib/fitness'

/** Weekly/monthly workout volume: minutes + calories bars from /workouts/history. */
export function WorkoutHistoryChart({ bucket = 'week', limit = 12 }: { bucket?: 'week' | 'month'; limit?: number }) {
  const { t } = useTranslation()
  const { data, isLoading } = useWorkoutHistory(bucket, limit)
  const points = toHistoryChartData(data ?? [])

  if (isLoading) return null
  if (points.length === 0) return null

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-2 text-sm font-medium">
          {bucket === 'week' ? t('fitness.weeklyTrend') : t('fitness.monthlyTrend')}
        </p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis yAxisId="minutes" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis yAxisId="calories" orientation="right" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="minutes" dataKey="minutes" name={t('fitness.statsMinutes')} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="calories" dataKey="calories" name={t('fitness.statsCalories')} fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
