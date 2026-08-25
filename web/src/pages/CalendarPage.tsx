import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Ban, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Circle, CheckCircle2, Flag } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import type { Event, Todo } from '../types'
import { useEventsList } from '../hooks/api/useEvents'
import { useTodosList } from '../hooks/api/useTodos'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] // Sun..Sat
const EMPTY_EVENTS: Event[] = []
const EMPTY_TODOS: Todo[] = []

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function sameDay(a: Date, b: Date) { return dayKey(a) === dayKey(b) }

export default function CalendarPage() {
  const { t } = useTranslation()
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor])
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor])
  const { data: eventsData } = useEventsList({ start_after: monthStart.toISOString(), end_before: monthEnd.toISOString(), page_size: 200 })
  const { data: todosData } = useTodosList({ page: 1, page_size: 200 })
  const events = eventsData?.items ?? EMPTY_EVENTS
  const todos = todosData?.items ?? EMPTY_TODOS

  // Build 6x7 grid
  const grid = useMemo(() => {
    const firstOffset = monthStart.getDay() // 0=Sun
    const start = new Date(monthStart)
    start.setDate(start.getDate() - firstOffset)
    const cells: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      cells.push(d)
    }
    return cells
  }, [monthStart])

  const eventsByDay = useMemo(() => {
    const result = new Map<string, Event[]>()
    for (const event of events) {
      const key = dayKey(new Date(event.start_time))
      const items = result.get(key)
      if (items) items.push(event)
      else result.set(key, [event])
    }
    return result
  }, [events])

  const todosByDay = useMemo(() => {
    const result = new Map<string, Todo[]>()
    for (const todo of todos) {
      if (!todo.due_time) continue
      const key = dayKey(new Date(todo.due_time))
      const items = result.get(key)
      if (items) items.push(todo)
      else result.set(key, [todo])
    }
    return result
  }, [todos])

  const monthLabel = cursor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">{t('calendar.title')}</h1>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar"><CalendarDays className="h-4 w-4 mr-1" />{t('calendar.month')}</TabsTrigger>
          <TabsTrigger value="matrix"><LayoutGrid className="h-4 w-4 mr-1" />{t('calendar.matrix')}</TabsTrigger>
        </TabsList>

        {/* Month calendar */}
        <TabsContent value="calendar" className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-base font-medium w-40 text-center">{monthLabel}</span>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>{t('calendar.today')}</Button>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {WEEKDAYS.map((w) => {
                  const lbl = new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: 'narrow' })
                  return <div key={w} className="py-1">{lbl}</div>
                })}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth()
              const isToday = sameDay(d, today)
              const evs = eventsByDay.get(dayKey(d)) ?? EMPTY_EVENTS
              const tds = todosByDay.get(dayKey(d)) ?? EMPTY_TODOS
              return (
                <div key={i} className={`min-h-[84px] rounded-md border p-1 text-xs ${inMonth ? 'bg-card' : 'bg-muted/30 opacity-50'} ${isToday ? 'ring-1 ring-primary' : ''}`}>
                  <div className={`text-right ${isToday ? 'font-bold text-primary' : ''}`}>{d.getDate()}</div>
                  <div className="space-y-0.5 mt-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <div key={`e${e.id}`} className="truncate rounded px-1 text-[10px] text-white" style={{ backgroundColor: e.color || '#3b82f6' }} title={e.title}>
                        {new Date(e.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} {e.title}
                      </div>
                    ))}
                    {tds.slice(0, 3).map((td) => (
                      <div key={`t${td.id}`} className={`truncate rounded px-1 text-[10px] flex items-center gap-0.5 ${td.status !== 'pending' ? 'line-through opacity-60' : ''}`}
                        style={{ backgroundColor: (td.color || '#22c55e') + '22', color: td.color || '#16a34a' }}
                        title={td.title}>
                        {td.status === 'done' ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> : td.status === 'abandoned' ? <Ban className="h-2.5 w-2.5 shrink-0" /> : <Circle className="h-2.5 w-2.5 shrink-0" />}
                        <span className="truncate">{td.title}</span>
                      </div>
                    ))}
                    {(evs.length + tds.length) > 6 && <div className="text-[10px] text-muted-foreground">+{evs.length + tds.length - 6}</div>}
                  </div>
                </div>
              )
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />{t('calendar.event')}</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />{t('calendar.todo')}</span>
          </div>
        </TabsContent>

        {/* Eisenhower matrix */}
        <TabsContent value="matrix">
          <Matrix todos={todos} t={t} now={today} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Matrix({ todos, t, now }: { todos: Todo[]; t: (k: string) => string; now: Date }) {
  const URGENT_HOURS = 48
  const isUrgent = (td: Todo) => {
    if (!td.due_time) return false
    const due = new Date(td.due_time).getTime()
    const diff = due - now.getTime()
    return diff <= URGENT_HOURS * 3600 * 1000 // overdue or within 48h
  }
  const isImportant = (td: Todo) => td.priority === 'high'
  const pending = todos.filter((td) => td.status === 'pending')

  const q1 = pending.filter((td) => isImportant(td) && isUrgent(td))
  const q2 = pending.filter((td) => isImportant(td) && !isUrgent(td))
  const q3 = pending.filter((td) => !isImportant(td) && isUrgent(td))
  const q4 = pending.filter((td) => !isImportant(td) && !isUrgent(td))

  if (pending.length === 0) return <EmptyState message={t('calendar.noPending')} />

  const cell = (title: string, color: string, items: Todo[], hint: string) => (
    <Card className="flex flex-col">
      <CardContent className="p-3 flex-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color }}>{title}</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
        <div className="space-y-1">
          {items.map((td) => (
            <div key={td.id} className="rounded border border-border px-2 py-1 text-xs flex items-center gap-1">
              {td.priority === 'high' && <Flag className="h-3 w-3 text-red-500 shrink-0" />}
              <span className="truncate flex-1">{td.title}</span>
              {td.due_time && <span className="text-[10px] text-muted-foreground shrink-0">{new Date(td.due_time).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>}
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-muted-foreground/60 py-2 text-center">—</p>}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>← {t('calendar.urgent')}</span><span>{t('calendar.notUrgent')} →</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cell(t('calendar.q1'), '#ef4444', q1, t('calendar.q1Hint'))}
        {cell(t('calendar.q2'), '#3b82f6', q2, t('calendar.q2Hint'))}
        {cell(t('calendar.q3'), '#f97316', q3, t('calendar.q3Hint'))}
        {cell(t('calendar.q4'), '#9ca3af', q4, t('calendar.q4Hint'))}
      </div>
      <div className="text-xs text-muted-foreground px-1">↑ {t('calendar.important')} / {t('calendar.notImportant')} ↓</div>
    </div>
  )
}
