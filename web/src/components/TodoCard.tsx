import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, ChevronDown, Circle, Clock, CalendarClock, ListTodo, ListTree, Plus, Repeat, ArrowRight, Copy, Pencil, Trash2, Star, CornerDownRight, Timer } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { formatDueLabel } from '../lib/dueLabel'
import type { SubtreeProgress } from '../lib/todoProgress'
import type { Todo } from '../types'

const priorityConfig: Record<string, { color: string; bg: string }> = {
  high: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  normal: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  low: { color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
}

const repeatLabelOf = (t: (k: string) => string, r?: string) =>
  r ? t(`todos.repeat${r.charAt(0).toUpperCase()}${r.slice(1)}`) : ''

export interface TodoCardProps {
  todo: Todo
  compact?: boolean
  contactNames: string
  selectable?: boolean
  selected?: boolean
  onSelectToggle?: (id: number) => void
  onToggle: (id: number) => void
  /** Explicit status change (abandon / restore / done without recurring advance). */
  onSetStatus?: (id: number, status: Todo['status']) => void
  onTogglePin: (todo: Todo) => void
  onSync: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  onRename: (id: number, title: string) => void
  onDuplicate: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  formatDate: (dateStr: string | null) => string
  parentTitle?: string
  onStartPomodoro?: (todo: Todo) => void
  /** One-click "postpone to tomorrow" (TickTick's signature reschedule). */
  onPostpone?: (todo: Todo) => void
  /** Nested subtask renderer (flat views); rendered inside the card body.
   *  On compact (kanban) cards it exists too but stays collapsed until the
   *  progress chip is clicked — drag overlays mount fresh, so they never
   *  carry the expanded list. */
  subtasks?: ReactNode
  /** Cross-subtask completion roll-up (done/total over all descendants). */
  subtaskProgress?: SubtreeProgress
}

const TodoCard = memo(function TodoCard({
  todo,
  compact = false,
  contactNames,
  selectable = false,
  selected = false,
  onSelectToggle,
  onToggle,
  onSetStatus,
  onTogglePin,
  onSync,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  formatDate,
  parentTitle,
  onStartPomodoro,
  onPostpone,
  subtasks,
  subtaskProgress,
}: TodoCardProps) {
  const { t } = useTranslation()
  const [editingTitle, setEditingTitle] = useState(false)
  const [draft, setDraft] = useState('')
  // Compact (kanban) cards hide their subtask list behind the progress chip
  // so the board and drag overlays stay lean.
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  // Single click on the title opens the detail drawer; double-click renames.
  // The two are disambiguated by delaying the click action long enough for a
  // second click to cancel it.
  const titleClickTimer = useRef<number | null>(null)
  const cancelPendingTitleClick = () => {
    if (titleClickTimer.current != null) {
      window.clearTimeout(titleClickTimer.current)
      titleClickTimer.current = null
    }
  }
  useEffect(() => () => {
    if (titleClickTimer.current != null) window.clearTimeout(titleClickTimer.current)
  }, [])

  const priorityLabel = t(`todos.${todo.priority}`)
  const syncLabel = t('todos.syncToEvent')
  const repeatLabel = repeatLabelOf(t, todo.repeat)
  const closed = todo.status !== 'pending'
  const abandonTitle = todo.status === 'abandoned' ? t('todos.markPending') : t('todos.markAbandoned')

  const startRename = () => {
    setDraft(todo.title)
    setEditingTitle(true)
  }
  const commitRename = () => {
    setEditingTitle(false)
    const next = draft.trim()
    if (next && next !== todo.title) onRename(todo.id, next)
  }

  return (
    <Card
      className={`group relative gap-0 py-0 ${closed ? 'opacity-60' : ''}`}
      style={todo.color ? { borderLeftColor: todo.color, borderLeftWidth: '3px' } : undefined}
    >
      <CardContent className={compact ? 'p-1.5 pr-16' : 'p-2 space-y-1'}>
        <div className="flex items-start gap-1.5">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelectToggle?.(todo.id)}
              className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer"
              aria-label={todo.title}
            />
          )}
          <button
            onClick={() => onToggle(todo.id)}
            aria-label={todo.status === 'pending' ? t('todos.markDone') : t('todos.markPending')}
            className="mt-0.5 shrink-0 cursor-pointer bg-transparent border-none"
          >
            {todo.status === 'done'
              ? <CheckCircle2 className="h-4 w-4 text-green-500" />
              : todo.status === 'abandoned'
                ? <Ban className="h-4 w-4 text-muted-foreground" />
                : <Circle className="h-4 w-4 text-muted-foreground hover:text-primary" />}
          </button>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                maxLength={200}
                className="text-sm font-medium w-full bg-transparent border-b border-primary outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  cancelPendingTitleClick()
                  titleClickTimer.current = window.setTimeout(() => {
                    titleClickTimer.current = null
                    onEdit(todo)
                  }, 250)
                }}
                onDoubleClick={() => {
                  cancelPendingTitleClick()
                  startRename()
                }}
                className={`block max-w-full text-left text-sm font-medium leading-snug cursor-text ${closed ? 'line-through text-muted-foreground' : ''}`}
                title={todo.title}
              >
                {todo.title}
              </button>
            )}
            {todo.description && !compact && (
              <p className="text-[11px] leading-snug text-muted-foreground line-clamp-1">{todo.description}</p>
            )}
          </div>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {todo.pinned && (
              <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label={t('todos.pinned')} />
            )}
            <Badge variant="secondary" className={`px-1 py-0 text-[10px] leading-none shrink-0 ${priorityConfig[todo.priority]?.bg || ''}`}>
              <span className={priorityConfig[todo.priority]?.color}>{priorityLabel}</span>
            </Badge>
            {parentTitle && (
              <span className="flex items-center gap-0.5 text-muted-foreground/80">
                <CornerDownRight className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{parentTitle}</span>
              </span>
            )}
            {todo.due_time && (
              <span className={`flex items-center gap-1 ${todo.status === 'pending' && new Date(todo.due_time) < new Date() ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                <Clock className="h-3 w-3" />
                {formatDueLabel(todo.due_time, new Date(), t)}
              </span>
            )}
            {todo.start_time && new Date(todo.start_time) > new Date() && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CalendarClock className="h-3 w-3" />
                {formatDate(todo.start_time)}
              </span>
            )}
            {(todo.item_total ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <ListTodo className="h-3 w-3" />
                {todo.item_done ?? 0}/{todo.item_total ?? 0}
              </span>
            )}
            {/* Cross-subtask roll-up over all descendants (not just checklist
                items) — complements the item_done chip above. */}
            {subtaskProgress && subtaskProgress.total > 0 && (
              <span
                className={cn(
                  'flex items-center gap-1 tabular-nums',
                  subtaskProgress.done === subtaskProgress.total ? 'text-green-600 dark:text-green-400' : '',
                )}
                title={t('todos.subtaskProgress', { done: subtaskProgress.done, total: subtaskProgress.total })}
              >
                <ListTree className="h-3 w-3" />
                {subtaskProgress.done}/{subtaskProgress.total}
              </span>
            )}
            {todo.repeat && repeatLabel && (
              <span className="flex items-center gap-1 text-primary">
                <Repeat className="h-3 w-3" />
                {repeatLabel}
              </span>
            )}
            {todo.amount != null && todo.amount > 0 && (
              <Badge variant="outline" className="px-1 py-0 text-[10px] leading-none">
                <span className={todo.amount_type === 'income' ? 'text-green-600' : 'text-red-600'}>
                  {todo.amount_type === 'income' ? '+' : '-'}{todo.amount}
                </span>
              </Badge>
            )}
            {todo.contact_ids?.length > 0 && contactNames && (
              <span>{contactNames}</span>
            )}
          </div>
        )}

        {/* Cross-subtask progress: a chip in the meta row (flat views), and
            the expand toggle for the collapsed subtask list (kanban). */}

        {!compact && (todo.item_total ?? 0) > 0 && (
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={todo.item_done ?? 0} aria-valuemin={0} aria-valuemax={todo.item_total ?? 0}>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round(((todo.item_done ?? 0) / (todo.item_total ?? 1)) * 100)}%` }}
            />
          </div>
        )}

        {!compact && todo.tags && todo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {todo.tags.map((tag) => (
              <span
                key={tag.id}
                className="px-1 py-px rounded text-[10px] font-medium leading-tight"
                style={{ backgroundColor: (tag.color || '#9ca3af') + '22', color: tag.color || '#6b7280' }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Kanban: expand/collapse the otherwise-hidden subtask list. */}
        {compact && subtaskProgress && subtaskProgress.total > 0 && (
          <button
            type="button"
            onClick={() => setSubtasksOpen((v) => !v)}
            aria-expanded={subtasksOpen}
            title={t('todos.subtaskProgress', { done: subtaskProgress.done, total: subtaskProgress.total })}
            className={cn(
              'mt-1 flex items-center gap-1 rounded px-0.5 text-[10px] tabular-nums hover:bg-muted/60',
              subtaskProgress.done === subtaskProgress.total ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
            )}
          >
            <ListTree className="h-3 w-3" />
            {subtaskProgress.done}/{subtaskProgress.total}
            <ChevronDown className={cn('h-3 w-3 transition-transform', subtasksOpen && 'rotate-180')} />
          </button>
        )}
        {/* Kanban cards with no subtasks yet still need the one add-subtask
            entry (the progress chip only exists once children do). */}
        {compact && subtasks && !subtasksOpen && (
          <button
            type="button"
            onClick={() => setSubtasksOpen(true)}
            className="mt-1 flex w-fit items-center gap-1 rounded px-0.5 text-[10px] text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t('todos.addChild')}
          </button>
        )}
      </CardContent>
      {subtasks && (!compact || subtasksOpen) && subtasks}

      {/* Action toolbar — floating top-right so it costs no row height.
          Hover-reveal on md+; always visible on touch/small screens. */}
      <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-md border bg-background/95 px-0.5 shadow-sm opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        {onStartPomodoro && (
          <Button variant="ghost" size="sm" className="h-5 gap-0.5 px-1 text-[10px]" onClick={() => onStartPomodoro(todo)} aria-label={t('todos.pomoStart')} title={t('todos.pomoStart')}>
            <Timer className="h-3 w-3" />
            {!!todo.pomodoro_count && <span className="tabular-nums">{todo.pomodoro_count}</span>}
          </Button>
        )}
        {onPostpone && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onPostpone(todo)} aria-label={t('todos.postponeToTomorrow')} title={t('todos.postponeToTomorrow')}>
            <CalendarClock className="h-3 w-3" />
          </Button>
        )}
        {onSetStatus && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => onSetStatus(todo.id, todo.status === 'abandoned' ? 'pending' : 'abandoned')}
            aria-label={abandonTitle}
            title={abandonTitle}
          >
            <Ban className={`h-3 w-3 ${todo.status === 'abandoned' ? 'text-destructive' : 'text-muted-foreground'}`} />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onTogglePin(todo)} aria-label={t('todos.pinAria')} title={t('todos.pinAria')}>
          <Star className={`h-3 w-3 ${todo.pinned ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onSync(todo)} aria-label={syncLabel} title={syncLabel}>
          <ArrowRight className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDuplicate(todo)} aria-label={t('todos.duplicate')} title={t('todos.duplicate')}>
          <Copy className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onEdit(todo)} aria-label={t('todos.editTodo')} title={t('todos.editTodo')}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => onDelete(todo)} aria-label={t('todos.deleteAria')} title={t('todos.deleteAria')}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  )
})

export default TodoCard
