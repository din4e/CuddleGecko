import { useState, useDeferredValue, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, TrendingUp, TrendingDown, Minus, Activity, Flame, Timer, CheckCircle2, Pencil, Trash2, Download, Dumbbell, Flame as StreakFlame } from 'lucide-react'
import ListPageHeader from '../components/ListPageHeader'
import EmptyState from '../components/EmptyState'
import { ListSkeleton } from '../components/ListSkeleton'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { WorkoutCard } from '../components/WorkoutCard'
import { WorkoutFormDialog } from '../components/WorkoutFormDialog'
import { ImportPlansDialog } from '../components/ImportPlansDialog'
import { ImportBodyDataDialog } from '../components/ImportBodyDataDialog'
import { StarRating } from '../components/StarRating'
import { BodyRecordFormDialog } from '../components/BodyRecordFormDialog'
import { BodyMetricsChart } from '../components/BodyMetricsChart'
import { WorkoutHistoryChart } from '../components/WorkoutHistoryChart'
import { FitnessGoalCard } from '../components/FitnessGoalCard'
import { ExerciseLibraryPanel, WorkoutTemplatesPanel } from '../components/FitnessLibraryTab'
import { useWorkoutsList, useWorkoutStats } from '../hooks/api/useWorkouts'
import { useBodyMetricsList, useBodyMetricSummary, useDeleteBodyMetric } from '../hooks/api/useBodyMetrics'
import { useWorkoutTemplates, useInstantiateTemplate } from '../hooks/api/useWorkoutTemplates'
import { dateAfterForRange, localDayKey, metricByDay, workoutDayKey, workoutsByDay, BODY_CHART_METRICS, type BodyChartMetric } from '../lib/fitness'
import { bmi } from '../types'
import type { Workout, WorkoutType, WorkoutStatus, BodyMetric } from '../types'

const TYPES: WorkoutType[] = ['strength', 'cardio', 'flexibility', 'balance', 'sport', 'other']
const STATUSES: WorkoutStatus[] = ['planned', 'in_progress', 'completed', 'skipped']

function cap(s: string) {
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}
// chartMetricLabel maps a chart metric to its camelCase i18n key ('bp' → bloodPressure).
const METRIC_LABEL_KEYS: Record<BodyChartMetric, string> = {
  weight: 'fitness.weight',
  body_fat: 'fitness.bodyFat',
  muscle_mass: 'fitness.muscleMass',
  bp: 'fitness.bloodPressure',
  resting_hr: 'fitness.restingHr',
  sleep_hours: 'fitness.sleepHours',
  steps: 'fitness.steps',
  energy: 'fitness.energy',
  mood: 'fitness.mood',
}
function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function FitnessPage() {
  const { t } = useTranslation()

  // --- Workouts state ---
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
  const [importOpen, setImportOpen] = useState(false)

  const { data: workoutsPage, isLoading: workoutsLoading } = useWorkoutsList({
    q: deferredQ,
    type: (typeFilter || undefined) as WorkoutType | undefined,
    status: (statusFilter || undefined) as WorkoutStatus | undefined,
    sort,
    page_size: 100,
  })
  const { data: stats } = useWorkoutStats()
  // Memoized so the cross-link highlight effects key off identity, not a fresh
  // `?? []` array per render (which would re-fire their scroll on every render).
  const workouts = useMemo(() => workoutsPage?.items ?? [], [workoutsPage])

  // --- Body records state ---
  const [bodyDialogOpen, setBodyDialogOpen] = useState(false)
  const [importDataOpen, setImportDataOpen] = useState(false)
  const [editingMetric, setEditingMetric] = useState<BodyMetric | null>(null)
  const [deleteMetricId, setDeleteMetricId] = useState<number | null>(null)
  const [chartMetric, setChartMetric] = useState<BodyChartMetric>('weight')
  const [chartRange, setChartRange] = useState<'30d' | '90d' | '1y' | 'all'>('all')
  const { data: bodyPage } = useBodyMetricsList(dateAfterForRange(chartRange))
  const { data: summary } = useBodyMetricSummary()
  const deleteMetric = useDeleteBodyMetric()
  const metrics = useMemo(() => bodyPage?.items ?? [], [bodyPage])

  // --- Workout ↔ body-record day correlation (local calendar days) ---
  // Full all-time metric set feeds the workout-card snapshots; shares the
  // 'all' cache entry with the chart query when chartRange is 'all'.
  const { data: allBodyPage } = useBodyMetricsList()
  const metricDay = useMemo(() => metricByDay(allBodyPage?.items ?? []), [allBodyPage])
  // Completed workouts inside the chart window → markers + body-record chips.
  const { data: trainedPage } = useWorkoutsList({
    status: 'completed',
    date_after: dateAfterForRange(chartRange),
    page_size: 100000,
  })
  const trainedDayWorkouts = useMemo(() => workoutsByDay(trainedPage?.items ?? []), [trainedPage])
  const trainedDayNames = useMemo(
    () => new Map([...trainedDayWorkouts].map(([day, ws]) => [day, ws.map((w) => w.name)])),
    [trainedDayWorkouts],
  )

  // Cross-link jumps: scroll the target row into view and ring it briefly.
  // Filters/chart range reset first so the target is actually rendered.
  const [highlightMetricId, setHighlightMetricId] = useState<number | null>(null)
  const [highlightWorkoutId, setHighlightWorkoutId] = useState<number | null>(null)

  const jumpToMetric = (m: BodyMetric) => {
    if (!metrics.some((x) => x.id === m.id)) setChartRange('all')
    setHighlightMetricId(m.id)
  }
  const jumpToWorkout = (w: Workout) => {
    setQ('')
    setTypeFilter('')
    setStatusFilter('')
    setHighlightWorkoutId(w.id)
  }
  // Re-run when the list lands (the jump may have just widened the range),
  // and only start the un-highlight timer once the row is on screen.
  useEffect(() => {
    if (highlightMetricId == null) return
    const el = document.getElementById(`body-metric-${highlightMetricId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => setHighlightMetricId(null), 2200)
    return () => window.clearTimeout(timer)
  }, [highlightMetricId, metrics])
  useEffect(() => {
    if (highlightWorkoutId == null) return
    const el = document.getElementById(`workout-card-${highlightWorkoutId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => setHighlightWorkoutId(null), 2200)
    return () => window.clearTimeout(timer)
  }, [highlightWorkoutId, workouts])

  // --- Templates (create-from-template in the workouts section header) ---
  const { data: templates } = useWorkoutTemplates()
  const instantiate = useInstantiateTemplate()
  const [templateId, setTemplateId] = useState('')

  const completionRate = stats && stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  const TrendIcon = summary?.weight_trend === 'up' ? TrendingUp : summary?.weight_trend === 'down' ? TrendingDown : Minus
  const latestBmi = summary?.latest ? bmi(summary.latest.weight, summary.latest.height) : 0

  const openNewWorkout = () => { setEditingWorkout(null); setWorkoutDialogOpen(true) }
  const openEditWorkout = (w: Workout) => { setEditingWorkout(w); setWorkoutDialogOpen(true) }
  const openNewMetric = () => { setEditingMetric(null); setBodyDialogOpen(true) }
  const openEditMetric = (m: BodyMetric) => { setEditingMetric(m); setBodyDialogOpen(true) }
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  // 「复制前一天」的来源：今天零点之前的最新一条；没有更早记录时回退最新一条。
  const copyFromMetric = metrics.find((m) => new Date(m.recorded_at) < startOfToday) ?? metrics[0] ?? null

  const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm'

  return (
    <div className="space-y-8">
      <ListPageHeader title={t('fitness.title')} />

      {/* ---- Merged overview: workout + body stats in one band ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label={t('fitness.statsCompleted')} value={stats?.completed ?? 0} />
        <StatCard icon={<Activity className="h-4 w-4 text-blue-500" />} label={t('fitness.statsThisWeek')} value={stats?.this_week ?? 0} />
        <StatCard icon={<Timer className="h-4 w-4 text-purple-500" />} label={t('fitness.statsMinutes')} value={`${stats?.total_minutes ?? 0} ${t('fitness.minutesShort')}`} />
        <StatCard icon={<Flame className="h-4 w-4 text-orange-500" />} label={t('fitness.statsCalories')} value={`${Math.round(stats?.total_calories ?? 0)}`} />
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
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{t('fitness.completionRate')}: {completionRate}%</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
          <StreakFlame className="h-3 w-3" />
          {t('fitness.streakWeeks')}: {stats?.streak_weeks ?? 0}
        </span>
      </div>

      {/* ---------------- Workouts ---------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('fitness.tabWorkouts')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={selectCls}
              value={templateId}
              onChange={async (e) => {
                const id = e.target.value
                setTemplateId(id)
                if (id) {
                  await instantiate.mutateAsync({ id: parseInt(id, 10) })
                  setTemplateId('')
                }
              }}
              aria-label={t('fitness.createFromTemplate')}
            >
              <option value="">{t('fitness.createFromTemplate')}</option>
              {templates?.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
            </select>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Download className="h-4 w-4 mr-1" />{t('fitness.importPlans')}
            </Button>
            <Button onClick={openNewWorkout}><Plus className="h-4 w-4 mr-1" />{t('fitness.newWorkout')}</Button>
          </div>
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2"><WorkoutHistoryChart bucket="week" limit={12} /></div>
          <FitnessGoalCard />
        </div>

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
        </div>

        {workoutsLoading ? (
          <ListSkeleton />
        ) : workouts.length === 0 ? (
          <EmptyState message={t('fitness.noWorkouts')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {workouts.map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onEdit={openEditWorkout}
                formatDate={fmtDate}
                dayMetric={metricDay.get(workoutDayKey(w) ?? '') ?? null}
                onShowDayMetric={jumpToMetric}
                highlighted={highlightWorkoutId === w.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Body records ---------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('fitness.tabBody')}</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportDataOpen(true)}>
              <Download className="h-4 w-4 mr-1" />{t('fitness.importData')}
            </Button>
            <Button onClick={openNewMetric}><Plus className="h-4 w-4 mr-1" />{t('fitness.newBodyRecord')}</Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{t('fitness.metricTrend')}</p>
              <div className="flex items-center gap-2">
                <select className={selectCls} value={chartMetric} onChange={(e) => setChartMetric(e.target.value as BodyChartMetric)} aria-label={t('fitness.metric')}>
                  {BODY_CHART_METRICS.map((m) => (
                    <option key={m} value={m}>{t(METRIC_LABEL_KEYS[m])}</option>
                  ))}
                </select>
                <select className={selectCls} value={chartRange} onChange={(e) => setChartRange(e.target.value as typeof chartRange)} aria-label={t('fitness.dateRange')}>
                  <option value="30d">{t('fitness.range30d')}</option>
                  <option value="90d">{t('fitness.range90d')}</option>
                  <option value="1y">{t('fitness.range1y')}</option>
                  <option value="all">{t('fitness.rangeAll')}</option>
                </select>
              </div>
            </div>
            {metrics.length > 0 && (
              <BodyMetricsChart
                metrics={metrics}
                metric={chartMetric}
                trainedDays={trainedDayNames}
                onWorkoutDayClick={(day) => {
                  const target = trainedDayWorkouts.get(day)?.[0]
                  if (target) jumpToWorkout(target)
                }}
              />
            )}
          </CardContent>
        </Card>

        {metrics.length === 0 ? (
          <EmptyState message={t('fitness.noBodyRecords')} />
        ) : (
          <div className="space-y-2">
            {metrics.map((m) => {
              const dayWorkouts = trainedDayWorkouts.get(localDayKey(m.recorded_at) ?? '') ?? []
              return (
                <Card
                  key={m.id}
                  id={`body-metric-${m.id}`}
                  className={highlightMetricId === m.id ? 'ring-2 ring-primary' : undefined}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                        <span className="font-medium">{fmtDate(m.recorded_at)}</span>
                        {m.weight != null && <span className="text-muted-foreground">{t('fitness.weight')}: {m.weight}kg</span>}
                        {m.body_fat != null && <span className="text-muted-foreground">{t('fitness.bodyFat')}: {m.body_fat}%</span>}
                        {m.systolic != null && m.diastolic != null && <span className="text-muted-foreground">{t('fitness.bloodPressure')}: {m.systolic}/{m.diastolic}</span>}
                        {m.resting_hr != null && <span className="text-muted-foreground">{t('fitness.restingHr')}: {m.resting_hr}</span>}
                        {m.sleep_hours != null && <span className="text-muted-foreground">{t('fitness.sleepHours')}: {m.sleep_hours}</span>}
                        {m.bedtime && <span className="text-muted-foreground">{t('fitness.bedtime')} {fmtTime(m.bedtime)}</span>}
                        {m.wake_time && <span className="text-muted-foreground">{t('fitness.wakeTime')} {fmtTime(m.wake_time)}</span>}
                        {m.sleep_score != null && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            {t('fitness.sleepScore')} <StarRating value={m.sleep_score} readOnly />
                          </span>
                        )}
                        {m.steps != null && <span className="text-muted-foreground">{t('fitness.steps')}: {m.steps}</span>}
                        {m.energy != null && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            {t('fitness.energy')} <StarRating value={m.energy} readOnly />
                          </span>
                        )}
                        {m.mood != null && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            {t('fitness.mood')} <StarRating value={m.mood} readOnly />
                          </span>
                        )}
                        {dayWorkouts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => jumpToWorkout(dayWorkouts[0])}
                            className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                            aria-label={t('fitness.showWorkouts')}
                            title={t('fitness.showWorkouts')}
                          >
                            <Dumbbell className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{dayWorkouts.map((w) => w.name).join(' · ')}</span>
                          </button>
                        )}
                      </div>
                      {m.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.notes}</p>}
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditMetric(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setDeleteMetricId(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ---------------- Library & templates ---------------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('fitness.tabLibrary')}</h2>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <ExerciseLibraryPanel />
          <WorkoutTemplatesPanel />
        </div>
      </section>

      {/* key remounts the dialog per record so the form state re-initializes
          from `editing` — without it, "edit" opened the create form with stale
          empty fields and Save produced a near-empty duplicate. Distinct
          fallbacks: the dialogs are siblings, a shared 'new' collided. */}
      <WorkoutFormDialog key={editingWorkout?.id ?? 'workout-new'} open={workoutDialogOpen} editing={editingWorkout} onClose={() => setWorkoutDialogOpen(false)} />
      <BodyRecordFormDialog key={editingMetric?.id ?? 'metric-new'} open={bodyDialogOpen} editing={editingMetric} copyFrom={copyFromMetric} onClose={() => setBodyDialogOpen(false)} />
      {/* Mounted only while open so its todos/events/habits queries don't run
          on every fitness page visit. */}
      {importOpen && <ImportPlansDialog open onClose={() => setImportOpen(false)} />}
      {importDataOpen && <ImportBodyDataDialog open onClose={() => setImportDataOpen(false)} />}
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
