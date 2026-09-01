import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { buttonVariants } from '../components/ui/button'
import type { Reminder, Event, Todo } from '../types'
import { useRemindersList } from '../hooks/api/useReminders'
import { useEventsList } from '../hooks/api/useEvents'
import { useTodosList, useTodoStats } from '../hooks/api/useTodos'
import { useTransactionsMonthly } from '../hooks/api/useTransactions'
import { useWorkoutsList } from '../hooks/api/useWorkouts'
import { useBodyMetricSummary } from '../hooks/api/useBodyMetrics'
import { bmi } from '../types'
import { StatGridSkeleton } from '../components/ListSkeleton'
import { InlineMarkdown } from '../components/InlineMarkdown'
import { useContactsList } from '../hooks/api/useContacts'
import {
  Users,
  CalendarCheck,
  Bell,
  CalendarDays,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Plus,
  Heart,
  Wallet,
  Clock,
  AlertCircle,
  ArrowRight,
  Dumbbell,
  Scale,
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
  Minus as MinusIcon,
} from 'lucide-react'

interface MonthBucket {
  key: string
  label: string
  income: number
  expense: number
}

function buildLast6Months(locale: string): MonthBucket[] {
  const buckets: MonthBucket[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString(locale, { month: 'short' })
    buckets.push({ key, label, income: 0, expense: 0 })
  }
  return buckets
}

function TrendChart({ buckets }: { buckets: MonthBucket[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = Math.max(1, ...buckets.flatMap((b) => [b.income, b.expense]))
  const W = Math.max(360, width)
  const H = 240
  const padL = 44
  const padR = 16
  const padT = 16
  const padB = 32
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const groupW = innerW / buckets.length
  const barW = Math.min(22, groupW / 3)
  const gridYs = [0, 0.25, 0.5, 0.75, 1]
  const fmt = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(Math.round(n))
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="income vs expense trend" className="block">
        {gridYs.map((g) => {
          const y = padT + innerH * (1 - g)
          return (
            <g key={g}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="currentColor" strokeWidth={0.5} className="text-muted/40" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
                {fmt(max * g)}
              </text>
            </g>
          )
        })}
        {buckets.map((b, i) => {
          const cx = padL + groupW * i + groupW / 2
          const incomeH = (b.income / max) * innerH
          const expenseH = (b.expense / max) * innerH
          return (
            <g key={b.key}>
              <rect
                x={cx - barW - 2}
                y={padT + innerH - incomeH}
                width={barW}
                height={incomeH}
                rx={3}
                className="fill-green-500 dark:fill-green-400"
              />
              <rect
                x={cx + 2}
                y={padT + innerH - expenseH}
                width={barW}
                height={expenseH}
                rx={3}
                className="fill-red-500 dark:fill-red-400"
              />
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const { data: remindersData, isPending: remindersLoading } = useRemindersList('pending', 1, 50)
  const { data: eventsData, isPending: eventsLoading } = useEventsList({ page: 1, page_size: 100, start_after: todayStart, end_before: todayEnd })
  const { data: todosData, isPending: todosLoading } = useTodosList({ status: 'pending', page: 1, page_size: 100 })
  // Accurate productivity totals (pending/overdue/deferred/…) for the stat tiles.
  const { data: todoStats } = useTodoStats()
  // Monthly income/expense aggregate (one tiny request) replaces fetching up to
  // 1000 transactions to sum them client-side; it drives both the trend chart
  // and the current-month tiles.
  const { data: monthlyData, isPending: monthlyLoading } = useTransactionsMonthly(6)
  const { data: contactsData } = useContactsList({ page: 1, page_size: 1 })
  // Fitness cards: nearest planned/in-progress workout + weight snapshot.
  const { data: workoutsUpcoming } = useWorkoutsList({ status: 'planned', sort: 'scheduled', order: 'asc', page: 1, page_size: 1 })
  const { data: workoutsInProgress } = useWorkoutsList({ status: 'in_progress', sort: 'scheduled', order: 'asc', page: 1, page_size: 1 })
  const { data: bodySummary } = useBodyMetricSummary()
  const upcomingWorkout = workoutsInProgress?.items?.[0] ?? workoutsUpcoming?.items?.[0] ?? null

  const reminders: Reminder[] = remindersData?.items ?? []
  const events: Event[] = eventsData?.items ?? []
  // Memoize so the array identity is stable while data is unchanged — a bare
  // `?? []` produces a NEW empty array every render, which (as the dependency
  // of the overdueTodos memo below) forced a pointless recompute per render.
  const todos = useMemo<Todo[]>(() => todosData?.items ?? [], [todosData])
  const totalContacts = contactsData?.total ?? 0
  const loading = remindersLoading || eventsLoading || todosLoading || monthlyLoading

  const trend = useMemo(() => {
    const buckets = buildLast6Months(i18n.language)
    const byKey = new Map((monthlyData ?? []).map((m) => [m.month, m]))
    for (const b of buckets) {
      const m = byKey.get(b.key)
      if (m) {
        b.income = m.income
        b.expense = m.expense
      }
    }
    return buckets
  }, [monthlyData, i18n.language])

  // The last bucket is the current month.
  const currentMonth = trend[trend.length - 1]
  const monthIncome = currentMonth?.income ?? 0
  const monthExpense = currentMonth?.expense ?? 0

  const overdueTodos = useMemo(() => {
    const now = new Date()
    return todos
      .filter((t0) => t0.due_time && new Date(t0.due_time) < now)
      .sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''))
      .slice(0, 5)
  }, [todos])

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  if (loading) return <StatGridSkeleton />

  const stats = [
    { title: t('dashboard.totalContacts'), value: totalContacts, icon: Users, color: 'text-blue-500', to: '/buddies' },
    { title: t('dashboard.todayEvents'), value: events.length, icon: CalendarDays, color: 'text-purple-500', to: '/events' },
    { title: t('dashboard.pendingTodos'), value: todoStats?.pending ?? 0, icon: ListChecks, color: 'text-orange-500', to: '/todos' },
    { title: t('dashboard.overdueTodos'), value: todoStats?.overdue ?? 0, icon: AlertCircle, color: 'text-red-500', to: '/todos' },
    { title: t('dashboard.deferredTodos'), value: todoStats?.deferred ?? 0, icon: Clock, color: 'text-amber-500', to: '/todos' },
    { title: t('dashboard.pendingReminders'), value: reminders.length, icon: Bell, color: 'text-yellow-500', to: '/reminders' },
    {
      title: t('dashboard.monthIncome'),
      value: fmt(monthIncome),
      icon: TrendingUp,
      color: 'text-green-500',
      to: '/finance',
    },
    {
      title: t('dashboard.monthExpense'),
      value: fmt(monthExpense),
      icon: TrendingDown,
      color: 'text-red-500',
      to: '/finance',
    },
  ]

  const quickActions = [
    { label: t('dashboard.newBuddy'), icon: Heart, to: '/buddies', color: 'text-pink-500' },
    { label: t('dashboard.newEvent'), icon: Plus, to: '/events', color: 'text-purple-500' },
    { label: t('dashboard.newTodo'), icon: ListChecks, to: '/todos', color: 'text-orange-500' },
    { label: t('dashboard.newTransaction'), icon: Wallet, to: '/finance', color: 'text-green-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">
          {t('dashboard.greeting')} 👋
        </h1>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ title, value, icon: Icon, color, to }) => (
          <Link key={title} to={to} className="group">
            <Card className="transition-colors group-hover:border-primary/40">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground truncate">{title}</span>
                  <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.quickActions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(({ label, icon: Icon, to, color }) => (
              <Link key={label} to={to} className={`${buttonVariants({ variant: 'outline', size: 'sm' })} flex items-center gap-1.5`}>
                <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's events */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4 text-purple-500" />
              {t('dashboard.todaysEvents')}
            </CardTitle>
            <Link to="/events" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('dashboard.noData')}</p>
            ) : (
              <ul className="space-y-2">
                {events.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
                    <div className="flex items-start gap-2 min-w-0">
                      {e.color && <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.title}</div>
                        {e.location && <div className="text-xs text-muted-foreground truncate">{e.location}</div>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {new Date(e.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming reminders */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-yellow-500" />
              {t('dashboard.upcomingReminders')}
            </CardTitle>
            <Link to="/reminders" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('dashboard.noData')}</p>
            ) : (
              <ul className="space-y-2">
                {reminders.slice(0, 5).map((r) => {
                  const due = new Date(r.remind_at)
                  const today = new Date()
                  const overdue = due < today
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                      <span className="font-medium truncate">{r.title}</span>
                      <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                        {due.toLocaleDateString()}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Overdue / pending todos */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              {t('dashboard.overdueTodos')}
            </CardTitle>
            <Link to="/todos" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {overdueTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('dashboard.noData')}</p>
            ) : (
              <ul className="space-y-2">
                {overdueTodos.map((t0) => (
                  <li key={t0.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                    <span className="font-medium truncate">
                      <InlineMarkdown text={t0.title} />
                    </span>
                    <span className="text-xs text-red-500 whitespace-nowrap">
                      {new Date(t0.due_time || '').toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fitness: upcoming workout + weight snapshot */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="h-4 w-4 text-orange-500" />
              {t('dashboard.upcomingWorkout')}
            </CardTitle>
            <Link to="/fitness" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {upcomingWorkout ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{upcomingWorkout.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(upcomingWorkout.scheduled_at || upcomingWorkout.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {upcomingWorkout.location && ` · ${upcomingWorkout.location}`}
                  </div>
                </div>
                {upcomingWorkout.status === 'in_progress' && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                    {t('fitness.statusInProgress')}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('dashboard.noData')}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-purple-500" />
              {t('dashboard.weightSnapshot')}
            </CardTitle>
            <Link to="/fitness" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {bodySummary?.latest_weight != null ? (
              <div className="flex items-end justify-between gap-2">
                <div>
                  <span className="text-2xl font-bold tabular-nums">{bodySummary.latest_weight}</span>
                  <span className="ml-1 text-sm text-muted-foreground">kg</span>
                  {bodySummary.latest?.height != null && (
                    <div className="text-xs text-muted-foreground">
                      {t('fitness.bmi')}: {bmi(bodySummary.latest_weight, bodySummary.latest.height).toFixed(1)}
                    </div>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {bodySummary.weight_trend === 'up' ? (
                    <TrendUpIcon className="h-4 w-4 text-green-500" />
                  ) : bodySummary.weight_trend === 'down' ? (
                    <TrendDownIcon className="h-4 w-4 text-red-500" />
                  ) : (
                    <MinusIcon className="h-4 w-4" />
                  )}
                  {t(`fitness.trend${bodySummary.weight_trend === 'none' ? 'None' : bodySummary.weight_trend.charAt(0).toUpperCase() + bodySummary.weight_trend.slice(1)}`)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('dashboard.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income/expense trend chart */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('dashboard.incomeExpenseTrend')}</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500 dark:bg-green-400" />
              <span className="text-muted-foreground">{t('dashboard.income')}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500 dark:bg-red-400" />
              <span className="text-muted-foreground">{t('dashboard.expense')}</span>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart buckets={trend} />
        </CardContent>
      </Card>
    </div>
  )
}
