import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button, buttonVariants } from '../components/ui/button'
import type { Reminder, Event, Todo, Transaction, GraphData } from '../types'
import { useRemindersList } from '../hooks/api/useReminders'
import { useEventsList } from '../hooks/api/useEvents'
import { useTodosList } from '../hooks/api/useTodos'
import { useTransactionsList } from '../hooks/api/useTransactions'
import { useContactsList } from '../hooks/api/useContacts'
import { useDashboardConfigStore } from '../stores/dashboardConfig'
import { FULL_WIDTH_WIDGETS } from '../lib/dashboard'
import { graphApi } from '../api/graph'
import { DashboardNetworkWidget } from '../components/DashboardNetworkWidget'
import { cn } from '@/lib/utils'
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
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Check,
  Network,
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
  const [editMode, setEditMode] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)

  const { order, hidden, load, save } = useDashboardConfigStore()

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    graphApi
      .get()
      .then((res) => setGraphData(res.data))
      .catch(() => {})
  }, [])

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const { data: remindersData, isPending: remindersLoading } = useRemindersList('pending', 1, 50)
  const { data: eventsData, isPending: eventsLoading } = useEventsList({ page: 1, page_size: 100, start_after: todayStart, end_before: todayEnd })
  const { data: todosData, isPending: todosLoading } = useTodosList({ status: 'pending', page: 1, page_size: 100 })
  const { data: txData, isPending: txLoading } = useTransactionsList({ page: 1, page_size: 1000 })
  const { data: contactsData } = useContactsList({ page: 1, page_size: 1 })

  const reminders: Reminder[] = remindersData?.items ?? []
  const events: Event[] = eventsData?.items ?? []
  const todos: Todo[] = todosData?.items ?? []
  const transactions: Transaction[] = txData?.items ?? []
  const totalContacts = contactsData?.total ?? 0
  const loading = remindersLoading || eventsLoading || todosLoading || txLoading

  const { monthIncome, monthExpense } = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    let inc = 0
    let exp = 0
    for (const tx of transactions) {
      if (tx.date >= monthStart) {
        if (tx.type === 'income') inc += tx.amount
        else exp += tx.amount
      }
    }
    return { monthIncome: inc, monthExpense: exp }
  }, [transactions, now])

  const trend = useMemo(() => {
    const buckets = buildLast6Months(i18n.language)
    const withinLast6 = transactions.filter((tx) => tx.date >= sixMonthsAgoFromNow())
    for (const tx of withinLast6) {
      const d = new Date(tx.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const b = buckets.find((x) => x.key === key)
      if (!b) continue
      if (tx.type === 'income') b.income += tx.amount
      else b.expense += tx.amount
    }
    return buckets
  }, [transactions, i18n.language])

  const overdueTodos = useMemo(() => {
    const now = new Date()
    return todos
      .filter((t0) => t0.due_time && new Date(t0.due_time) < now)
      .sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''))
      .slice(0, 5)
  }, [todos])

  // Contacts seen in recent activity (today's events + pending todos + recent transactions),
  // used to scope the dashboard network widget. Capped to keep the graph readable.
  const recentContactIds = useMemo(() => {
    const ids = new Set<number>()
    events.forEach((e) => (e.contact_ids || []).forEach((id) => ids.add(id)))
    todos.forEach((t0) => (t0.contact_ids || []).forEach((id) => ids.add(id)))
    // transactions are fetched as the most-recent page (page_size:1000), so all are "recent".
    transactions.forEach((tx) => (tx.contact_ids || []).forEach((id) => ids.add(id)))
    return new Set([...ids].slice(0, 24))
  }, [events, todos, transactions])

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  if (loading) return <div>{t('dashboard.loading')}</div>

  const stats = [
    { title: t('dashboard.totalContacts'), value: totalContacts, icon: Users, color: 'text-blue-500', to: '/buddies' },
    { title: t('dashboard.todayEvents'), value: events.length, icon: CalendarDays, color: 'text-purple-500', to: '/events' },
    { title: t('dashboard.pendingTodos'), value: todos.length, icon: ListChecks, color: 'text-orange-500', to: '/todos' },
    { title: t('dashboard.pendingReminders'), value: reminders.length, icon: Bell, color: 'text-yellow-500', to: '/reminders' },
    { title: t('dashboard.monthIncome'), value: fmt(monthIncome), icon: TrendingUp, color: 'text-green-500', to: '/finance' },
    { title: t('dashboard.monthExpense'), value: fmt(monthExpense), icon: TrendingDown, color: 'text-red-500', to: '/finance' },
  ]

  const quickActions = [
    { label: t('dashboard.newBuddy'), icon: Heart, to: '/buddies', color: 'text-pink-500' },
    { label: t('dashboard.newEvent'), icon: Plus, to: '/events', color: 'text-purple-500' },
    { label: t('dashboard.newTodo'), icon: ListChecks, to: '/todos', color: 'text-orange-500' },
    { label: t('dashboard.newTransaction'), icon: Wallet, to: '/finance', color: 'text-green-500' },
  ]

  // In edit mode render every widget (so hidden ones can be un-hidden); otherwise hide them.
  const visibleOrder = editMode ? order : order.filter((id) => !hidden.includes(id))

  const toggleHide = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]
    save(order, next)
  }

  const handleDrop = (toIdx: number) => {
    if (dragIndex === null || dragIndex === toIdx) {
      setDragIndex(null)
      return
    }
    const next = [...order]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(toIdx, 0, moved)
    setDragIndex(null)
    save(next, hidden)
  }

  const renderWidget = (id: string) => {
    switch (id) {
      case 'stats':
        return (
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
        )
      case 'quickActions':
        return (
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
        )
      case 'events':
        return (
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
        )
      case 'reminders':
        return (
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
        )
      case 'todos':
        return (
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
                      <span className="font-medium truncate">{t0.title}</span>
                      <span className="text-xs text-red-500 whitespace-nowrap">
                        {new Date(t0.due_time || '').toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      case 'network':
        return (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4 text-primary" />
                {t('dashboard.networkTitle')}
              </CardTitle>
              <Link to="/graph" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <DashboardNetworkWidget graphData={graphData} recentIds={recentContactIds} />
            </CardContent>
          </Card>
        )
      case 'trend':
        return (
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
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">
          {t('dashboard.greeting')} 👋
        </h1>
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {editMode ? t('dashboard.done') : t('dashboard.customize')}
        </Button>
      </div>

      {editMode && (
        <p className="text-xs text-muted-foreground -mt-3">{t('dashboard.editHint')}</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {visibleOrder.map((id, idx) => {
          const isHidden = hidden.includes(id)
          const fullWidth = FULL_WIDTH_WIDGETS.has(id)
          return (
            <div
              key={id}
              className={cn(
                'col-span-1',
                fullWidth && 'lg:col-span-3',
                editMode && 'rounded-xl ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
                editMode && isHidden && 'opacity-50',
                editMode && 'bg-card/40',
              )}
              draggable={editMode}
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => {
                if (editMode) e.preventDefault()
              }}
              onDrop={() => handleDrop(idx)}
            >
              {editMode && (
                <div className="flex items-center justify-between px-1 pb-1 pt-1 select-none">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-grab">
                    <GripVertical className="h-3.5 w-3.5" />
                    {id}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleHide(id)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={isHidden ? t('dashboard.showWidget') : t('dashboard.hideWidget')}
                  >
                    {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isHidden ? t('dashboard.showWidget') : t('dashboard.hideWidget')}
                  </button>
                </div>
              )}
              <div className={editMode ? 'pointer-events-none' : undefined}>{renderWidget(id)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function sixMonthsAgoFromNow(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
}
