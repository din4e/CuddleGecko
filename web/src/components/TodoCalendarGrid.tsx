import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Plus, Circle, CheckCircle2, Ban, Inbox } from 'lucide-react'
import { Button } from './ui/button'
import { useTodosList } from '../hooks/api/useTodos'
import { isSettledStatus } from '../lib/buildTodoTree'
import type { Todo, TodoPriority } from '../types'

// TickTick-style month calendar for todos: every day cell lists the tasks due
// that day; dragging a chip onto another day reschedules it (the page's
// handleReschedule keeps the time of day), dropping it on the trailing Inbox
// strip clears the due date. The Inbox strip doubles as the drag source for
// scheduling unscheduled captures — no full draggable cards here, just light
// chips, so the grid stays fast even with a busy month.

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] // Sun..Sat
const PAGE_SIZE = 500

export interface TodoCalendarGridProps {
  /** Mirror of the toolbar filters (search / priority / tags). */
  filters: { q?: string; priority?: TodoPriority; tag_id?: number[] }
  /** One-click hide completed & abandoned (same toggle as the flat views). */
  hideDone: boolean
  onReschedule: (todo: Todo, target: Date | null) => void
  onEdit: (todo: Todo) => void
  /** Quick create with the due date prefilled (the cell's "+" button). */
  onCreateAt: (date: Date) => void
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PRIORITY_TINT: Record<string, { bg: string; fg: string }> = {
  high: { bg: '#ef4444', fg: '#b91c1c' },
  normal: { bg: '#f59e0b', fg: '#b45309' },
  low: { bg: '#3b82f6', fg: '#1d4ed8' },
}

function chipTint(todo: Todo) {
  if (todo.color) return { bg: todo.color, fg: todo.color }
  return PRIORITY_TINT[todo.priority] ?? { bg: '#22c55e', fg: '#16a34a' }
}

function ChipIcon({ status }: { status: Todo['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
  if (status === 'abandoned') return <Ban className="h-2.5 w-2.5 shrink-0" />
  return <Circle className="h-2.5 w-2.5 shrink-0" />
}

/** One task chip inside a day cell. Draggable; opens the detail drawer on click. */
function CalendarChip({ todo, onEdit }: { todo: Todo; onEdit: (todo: Todo) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `todo-${todo.id}` })
  const tint = chipTint(todo)
  const due = todo.due_time ? new Date(todo.due_time) : null
  const hasTime = due != null && !(due.getHours() === 0 && due.getMinutes() === 0)
  const closed = todo.status !== 'pending'
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onEdit(todo)}
      title={todo.title}
      className={`flex w-full items-center gap-1 truncate rounded px-1 py-px text-left text-[11px] leading-tight touch-none ${
        closed ? 'line-through opacity-50' : ''
      } ${isDragging ? 'opacity-30' : ''}`}
      style={{ backgroundColor: tint.bg + '22', color: tint.fg }}
    >
      <ChipIcon status={todo.status} />
      {hasTime && <span className="shrink-0 tabular-nums">{due!.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
      <span className="truncate">{todo.title}</span>
    </button>
  )
}

/** A day cell: droppable target that reschedules dropped chips to this day. */
function DayCell({
  date,
  inMonth,
  isToday,
  todos,
  remainingTitles,
  onEdit,
  onCreateAt,
}: {
  date: Date
  inMonth: boolean
  isToday: boolean
  todos: Todo[]
  remainingTitles: string
  onEdit: (todo: Todo) => void
  onCreateAt: (date: Date) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayKey(date)}` })
  const visible = todos.slice(0, 3)
  const overflow = todos.length - visible.length
  return (
    <div
      ref={setNodeRef}
      className={`group/cell relative flex min-h-[92px] flex-col rounded-md border p-1 text-xs ${
        inMonth ? 'bg-card' : 'bg-muted/30 opacity-50'
      } ${isToday ? 'ring-1 ring-primary' : ''} ${isOver ? 'border-primary bg-primary/10' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-right text-[11px] ${isToday ? 'font-bold text-primary' : 'text-muted-foreground'}`}>{date.getDate()}</span>
        <button
          type="button"
          onClick={() => onCreateAt(date)}
          title="+"
          aria-label="add todo on this day"
          className="hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover/cell:block"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-0.5 space-y-0.5">
        {visible.map((todo) => (
          <CalendarChip key={todo.id} todo={todo} onEdit={onEdit} />
        ))}
        {overflow > 0 && (
          <div className="px-1 text-[10px] text-muted-foreground" title={remainingTitles}>
            +{overflow}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TodoCalendarGrid({ filters, hideDone, onReschedule, onEdit, onCreateAt }: TodoCalendarGridProps) {
  const { t } = useTranslation()
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [dragId, setDragId] = useState<number | null>(null)

  const gridStart = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    return new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay())
  }, [cursor])
  const gridEnd = useMemo(() => endOfDay(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41)), [gridStart])

  const monthParams = useMemo(() => ({
    ...filters,
    due_after: gridStart.toISOString(),
    due_before: gridEnd.toISOString(),
    sort: 'due_date' as const,
    order: 'asc' as const,
    page: 1,
    page_size: PAGE_SIZE,
  }), [filters, gridStart, gridEnd])
  const { data: monthData, isPending } = useTodosList(monthParams)
  // The capture queue (pending, actionable, undated) rides along as a strip:
  // drop a chip here to unschedule it; drag a capture onto a day to schedule it.
  const inboxParams = useMemo(() => ({
    ...filters,
    status: 'pending' as const,
    started: true,
    no_due: true,
    page: 1,
    page_size: 50,
  }), [filters])
  const { data: inboxData } = useTodosList(inboxParams)

  const todos = useMemo(() => {
    const items = monthData?.items ?? []
    return hideDone ? items.filter((td) => !isSettledStatus(td.status)) : items
  }, [monthData, hideDone])
  const inboxTodos = useMemo(() => inboxData?.items ?? [], [inboxData])

  const byDay = useMemo(() => {
    const m = new Map<string, Todo[]>()
    for (const todo of todos) {
      if (!todo.due_time) continue
      const key = dayKey(new Date(todo.due_time))
      const items = m.get(key)
      if (items) items.push(todo)
      else m.set(key, [todo])
    }
    return m
  }, [todos])

  const cells = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < 42; i++) {
      out.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
    }
    return out
  }, [gridStart])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const todoById = useMemo(() => {
    const m = new Map<number, Todo>()
    for (const td of todos) m.set(td.id, td)
    for (const td of inboxTodos) m.set(td.id, td)
    return m
  }, [todos, inboxTodos])

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    if (id.startsWith('todo-')) setDragId(Number(id.slice(5)))
  }
  const handleDragEnd = (e: DragEndEvent) => {
    setDragId(null)
    const over = e.over?.id
    if (!over) return
    const id = String(e.active.id)
    if (!id.startsWith('todo-')) return
    const todo = todoById.get(Number(id.slice(5)))
    if (!todo) return
    if (over === 'inbox') {
      onReschedule(todo, null)
      return
    }
    const overStr = String(over)
    if (overStr.startsWith('day-')) {
      const [y, m, d] = overStr.slice(4).split('-').map(Number)
      onReschedule(todo, new Date(y, m - 1, d))
    }
  }

  const draggingTodo = dragId != null ? todoById.get(dragId) : undefined
  const monthLabel = cursor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragId(null)}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-40 text-center text-base font-medium">{monthLabel}</span>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            {t('todos.today')}
          </Button>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: 'narrow' })}
                </div>
              ))}
            </div>
            {isPending ? (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((_, i) => (
                  <div key={i} className="min-h-[92px] rounded-md border bg-muted/20 p-1" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d) => {
                  const dayTodos = byDay.get(dayKey(d)) ?? []
                  return (
                    <DayCell
                      key={dayKey(d)}
                      date={d}
                      inMonth={d.getMonth() === cursor.getMonth()}
                      isToday={dayKey(d) === dayKey(today)}
                      todos={dayTodos}
                      remainingTitles={dayTodos.slice(3).map((td) => td.title).join('\n')}
                      onEdit={onEdit}
                      onCreateAt={onCreateAt}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <InboxStrip todos={inboxTodos} onEdit={onEdit} />
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingTodo && (
          <div
            className="max-w-48 truncate rounded border bg-card px-1.5 py-0.5 text-[11px] shadow-md"
            style={{ borderLeftColor: chipTint(draggingTodo).bg, borderLeftWidth: 3 }}
          >
            {draggingTodo.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** The undated capture queue: a droppable strip — dropping a chip here clears
 *  its due time; its own chips drag out onto the grid to get scheduled. */
function InboxStrip({ todos, onEdit }: { todos: Todo[]; onEdit: (todo: Todo) => void }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: 'inbox' })
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1.5 overflow-x-auto rounded-md border border-dashed p-1.5 ${
        isOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'
      }`}
    >
      <span className="flex shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground">
        <Inbox className="h-3.5 w-3.5" />
        {t('todos.inbox')}
      </span>
      {todos.length === 0 && <span className="text-xs text-muted-foreground/60">{t('todos.inboxEmptyHint')}</span>}
      {todos.map((todo) => (
        <InboxChip key={todo.id} todo={todo} onEdit={onEdit} />
      ))}
    </div>
  )
}

function InboxChip({ todo, onEdit }: { todo: Todo; onEdit: (todo: Todo) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `todo-${todo.id}` })
  const tint = chipTint(todo)
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onEdit(todo)}
      title={todo.title}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-tight touch-none ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ borderColor: tint.bg + '55', backgroundColor: tint.bg + '18', color: tint.fg }}
    >
      <Circle className="h-2.5 w-2.5 shrink-0" />
      <span className="max-w-40 truncate">{todo.title}</span>
    </button>
  )
}
