import { useState, useDeferredValue } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, TrendingUp, TrendingDown, Minus, Activity, Flame, Timer, CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import ListPageHeader from '../components/ListPageHeader'
import EmptyState from '../components/EmptyState'
import { ListSkeleton } from '../components/ListSkeleton'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Card, CardContent } from '../components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { WorkoutCard } from '../components/WorkoutCard'
import { WorkoutFormDialog } from '../components/WorkoutFormDialog'
import { BodyRecordFormDialog } from '../components/BodyRecordFormDialog'
import { BodyMetricsChart } from '../components/BodyMetricsChart'
import { useWorkoutsList, useWorkoutStats } from '../hooks/api/useWorkouts'
import { useBodyMetricsList, useBodyMetricSummary, useDeleteBodyMetric } from '../hooks/api/useBodyMetrics'
import { bmi } from '../types'
import type { Workout, WorkoutType, WorkoutStatus, BodyMetric } from '../types'

const TYPES: WorkoutType[] = ['strength', 'cardio', 'flexibility', 'balance', 'sport', 'other']
const STATUSES: WorkoutStatus[] = ['planned', 'in_progress', 'completed', 'skipped']

function cap(s: string) {
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function FitnessPage() {
  const { t } = useTranslation()

  // --- Workouts tab state ---
  const [q, setQ] = useState('')
  // Debounce the search: the input stays responsive on `q`, but the list query
  // only refires once typing settles (one network request per pause, not per
  // keystroke). Matches the ContactsPage pattern.
  const deferredQ = useDeferredValue(q)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<'scheduled' | 'created'>('scheduled')
  const [workoutDialogOpen, setWorkoutDialogOpen] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null)

  const { data: workoutsPage, isLoading: workoutsLoading } = useWorkoutsList({
    q: deferredQ,
    type: (typeFilter || undefined) as WorkoutType | undefined,
    status: (statusFilter || undefined) as WorkoutStatus | undefined,
    sort,
    page_size: 100,
  })
  const { data: stats } = useWorkoutStats()
  const workouts = workoutsPage?.items ?? []

  // --- Body tab state ---
  const [bodyDialogOpen, setBodyDialogOpen] = useState(false)
  const [editingMetric, setEditingMetric] = useState<BodyMetric | null>(null)
  const [deleteMetricId, setDeleteMetricId] = useState<number | null>(null)
  const { data: bodyPage } = useBodyMetricsList()
  const { data: summary } = useBodyMetricSummary()
  const deleteMetric = useDeleteBodyMetric()
  const metrics = bodyPage?.items ?? []

  const completionRate = stats && stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  const TrendIcon = summary?.weight_trend === 'up' ? TrendingUp : summary?.weight_trend === 'down' ? TrendingDown : Minus
  const latestBmi = summary?.latest ? bmi(summary.latest.weight, summary.latest.height) : 0

  const openNewWorkout = () => { setEditingWorkout(null); setWorkoutDialogOpen(true) }
  const openEditWorkout = (w: Workout) => { setEditingWorkout(w); setWorkoutDialogOpen(true) }
  const openNewMetric = () => { setEditingMetric(null); setBodyDialogOpen(true) }
  const openEditMetric = (m: BodyMetric) => { setEditingMetric(m); setBodyDialogOpen(true) }

  const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm'

  return (
    <div className="space-y-6">
      <ListPageHeader title={t('fitness.title')} />

      <Tabs defaultValue="workouts">
        <TabsList>
          <TabsTrigger value="workouts">{t('fitness.tabWorkouts')}</TabsTrigger>
          <TabsTrigger value="body">{t('fitness.tabBody')}</TabsTrigger>
        </TabsList>

        {/* ---------------- Workouts ---------------- */}
        <TabsContent value="workouts" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label={t('fitness.statsCompleted')} value={stats?.completed ?? 0} />
            <StatCard icon={<Activity className="h-4 w-4 text-blue-500" />} label={t('fitness.statsThisWeek')} value={stats?.this_week ?? 0} />
            <StatCard icon={<Timer className="h-4 w-4 text-purple-500" />} label={t('fitness.statsMinutes')} value={`${stats?.total_minutes ?? 0} ${t('fitness.minutesShort')}`} />
            <StatCard icon={<Flame className="h-4 w-4 text-orange-500" />} label={t('fitness.statsCalories')} value={`${Math.round(stats?.total_calories ?? 0)}`} />
          </div>
          <div className="text-xs text-muted-foreground">{t('fitness.completionRate')}: {completionRate}%</div>

          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder={t('fitness.name')} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-xs" />
            <select className={selectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">{t('fitness.allTypes')}</option>
              {TYPES.map((ty) => <option key={ty} value={ty}>{t(`fitness.type${cap(ty)}`)}</option>)}
            </select>
            <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('fitness.allStatuses')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`fitness.status${cap(s)}`)}</option>)}
            </select>
            <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as 'scheduled' | 'created')}>
              <option value="scheduled">{t('fitness.scheduledAt')}</option>
              <option value="created">{t('fitness.recordedAt')}</option>
            </select>
            <div className="ml-auto">
              <Button onClick={openNewWorkout}><Plus className="h-4 w-4 mr-1" />{t('fitness.newWorkout')}</Button>
            </div>
          </div>

          {workoutsLoading ? (
            <ListSkeleton />
          ) : workouts.length === 0 ? (
            <EmptyState message={t('fitness.noWorkouts')} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {workouts.map((w) => (
                <WorkoutCard key={w.id} workout={w} onEdit={openEditWorkout} formatDate={fmtDate} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Body records ---------------- */}
        <TabsContent value="body" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<TrendIcon className="h-4 w-4 text-blue-500" />}
              label={t('fitness.latestWeight')}
              value={summary?.latest_weight != null ? `${summary.latest_weight} kg` : '—'}
              hint={summary?.weight_trend && summary.weight_trend !== 'none' ? t(`fitness.trend${cap(summary.weight_trend)}`) : undefined}
            />
            <StatCard icon={<Activity className="h-4 w-4 text-purple-500" />} label={t('fitness.bmi')} value={latestBmi ? latestBmi.toFixed(1) : '—'} />
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label={t('fitness.bodyFat')} value={summary?.latest?.body_fat != null ? `${summary.latest.body_fat}%` : '—'} />
            <StatCard icon={<Timer className="h-4 w-4 text-gray-500" />} label={t('fitness.totalRecords')} value={summary?.count ?? 0} />
          </div>

          {metrics.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-medium">{t('fitness.weightTrend')}</p>
                <BodyMetricsChart metrics={metrics} />
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('fitness.tabBody')}</h2>
            <Button onClick={openNewMetric}><Plus className="h-4 w-4 mr-1" />{t('fitness.newBodyRecord')}</Button>
          </div>

          {metrics.length === 0 ? (
            <EmptyState message={t('fitness.noBodyRecords')} />
          ) : (
            <div className="space-y-2">
              {metrics.map((m) => (
                <Card key={m.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                        <span className="font-medium">{fmtDate(m.recorded_at)}</span>
                        {m.weight != null && <span className="text-muted-foreground">{t('fitness.weight')}: {m.weight}kg</span>}
                        {m.body_fat != null && <span className="text-muted-foreground">{t('fitness.bodyFat')}: {m.body_fat}%</span>}
                        {m.systolic != null && m.diastolic != null && <span className="text-muted-foreground">{t('fitness.bloodPressure')}: {m.systolic}/{m.diastolic}</span>}
                        {m.resting_hr != null && <span className="text-muted-foreground">{t('fitness.restingHr')}: {m.resting_hr}</span>}
                        {m.sleep_hours != null && <span className="text-muted-foreground">{t('fitness.sleepHours')}: {m.sleep_hours}</span>}
                        {m.steps != null && <span className="text-muted-foreground">{t('fitness.steps')}: {m.steps}</span>}
                      </div>
                      {m.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.notes}</p>}
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditMetric(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setDeleteMetricId(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* key remounts the dialog per record so the form state re-initializes
          from `editing` — without it, "edit" opened the create form with stale
          empty fields and Save produced a near-empty duplicate. */}
      <WorkoutFormDialog key={editingWorkout?.id ?? 'new'} open={workoutDialogOpen} editing={editingWorkout} onClose={() => setWorkoutDialogOpen(false)} />
      <BodyRecordFormDialog key={editingMetric?.id ?? 'new'} open={bodyDialogOpen} editing={editingMetric} onClose={() => setBodyDialogOpen(false)} />
      <ConfirmDialog
        open={deleteMetricId != null}
        onOpenChange={(o) => { if (!o) setDeleteMetricId(null) }}
        message={t('fitness.deleteConfirmWorkout')}
        onConfirm={async () => { if (deleteMetricId != null) await deleteMetric.mutateAsync(deleteMetricId); setDeleteMetricId(null) }}
      />
    </div>
  )
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="mt-1 text-xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
