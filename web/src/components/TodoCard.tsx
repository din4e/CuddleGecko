import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, ChevronDown, Circle, Clock, CalendarClock, ListTodo, ListTree, Plus, Repeat, ArrowRight, Copy, Pencil, Trash2, Star, CornerDownRight, Timer, MoreVertical } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { cn } from '../lib/utils'
import { formatDueLabel } from '../lib/dueLabel'
import { collapseKey, useTodoCollapseStore } from '../stores/todoCollapse'
import { priorityConfig } from '../lib/todoPriority'
import { AddChildInput } from './AddChildInput'
import type { SubtreeProgress } from '../lib/todoProgress'
import type { Todo } from '../types'
import { InlineMarkdown } from './InlineMarkdown'

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
  /** Inline quick-add for this todo's subtasks: the toolbar's right-side "+"
   *  reveals a shared input under the card. The only add-subtask entry on the
   *  card — rows inside the subtask section carry their own right-side "+". */
  onCreateChild?: (parent: Todo, title: string) => void
  /** Which surface's fold state the section chip toggles (see
   *  todoCollapse) — each page keeps its own folds. */
  collapseScope?: string
  /** Nested subtask renderer (flat views); rendered inside the card body.
   *  On compact (kanban) cards it exists too but stays collapsed until the
   *  progress chip is clicked — drag overlays mount fresh, so they never
   *  carry the expanded list. */
  subtasks?: ReactNode
  /** Cross-subtask completion roll-up (done/total over all descendants). */
  subtaskProgress?: SubtreeProgress
  /** Native subtask drag in flight (page-level id, spans cards). While set
   *  the whole card is a nest drop target: dropping a subtask ON a task
   *  makes it that task's last child — mirroring the dnd-kit middle-zone
   *  nesting card drags already have (TodoSortableGroups.onNest). */
  subtaskDragId?: number | null
  onNestSubtask?: (draggedId: number, parentId: number) => void
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
  onCreateChild,
  subtasks,
  subtaskProgress,
  subtaskDragId,
  onNestSubtask,
  collapseScope = 'page',
}: TodoCardProps) {
  const { t } = useTranslation()
  const [editingTitle, setEditingTitle] = useState(false)
  const [draft, setDraft] = useState('')
  // Compact (kanban) cards hide their subtask list behind the progress chip
  // so the board and drag overlays stay lean.
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  // The toolbar "+" toggles the card's inline add-subtask input (the one
  // add entry, top-right like every other card action).
  const [addingChild, setAddingChild] = useState(false)
  // Native subtask drag hovering this card (nest target highlight).
  const [nestHover, setNestHover] = useState(false)
  const canNest = subtaskDragId != null && subtaskDragId !== todo.id && onNestSubtask != null
  // Flat views fold the card's subtask list through the shared persisted
  // collapse store (synced with the drawer and every nesting depth inside).
  // Only meaningful while children exist — a stale fold must never hide the
  // "add subtask" entry of a todo whose children were all removed.
  const collapseHas = useTodoCollapseStore((s) => s.collapsed.has(collapseKey(collapseScope, todo.id)))
  const toggleCollapse = useTodoCollapseStore((s) => s.toggle)
  const sectionFolded = !!subtaskProgress && subtaskProgress.total > 0 && collapseHas
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

  // Toolbar actions, rendered twice from one list: the md+ hover strip and the
  // small-screen kebab menu (the 8-button strip would cover the card's
  // title/meta on a phone-width card).
  const actions: {
    key: string
    label: string
    onClick: () => void
    children: ReactNode
    btnClass?: string
    destructive?: boolean
  }[] = [
    ...(onStartPomodoro ? [{
      key: 'pomo',
      label: t('todos.pomoStart'),
      onClick: () => onStartPomodoro(todo),
      children: (<><Timer className="h-3 w-3" />{!!todo.pomodoro_count && <span className="tabular-nums">{todo.pomodoro_count}</span>}</>),
      btnClass: 'h-5 gap-0.5 px-1 text-[10px]',
    }] : []),
    ...(onPostpone ? [{
      key: 'postpone',
      label: t('todos.postponeToTomorrow'),
      onClick: () => onPostpone(todo),
      children: <CalendarClock className="h-3 w-3" />,
    }] : []),
    ...(onSetStatus ? [{
      key: 'abandon',
      label: abandonTitle,
      onClick: () => onSetStatus(todo.id, todo.status === 'abandoned' ? 'pending' : 'abandoned'),
      children: <Ban className={`h-3 w-3 ${todo.status === 'abandoned' ? 'text-destructive' : 'text-muted-foreground'}`} />,
    }] : []),
    {
      key: 'pin',
      label: t('todos.pinAria'),
      onClick: () => onTogglePin(todo),
      children: <Star className={`h-3 w-3 ${todo.pinned ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />,
    },
    ...(onCreateChild ? [{
      key: 'addChild',
      label: t('todos.addChild'),
      onClick: () => setAddingChild((v) => !v),
      children: <Plus className="h-3 w-3" />,
    }] : []),
    {
      key: 'sync',
      label: syncLabel,
      onClick: () => onSync(todo),
      children: <ArrowRight className="h-3 w-3" />,
    },
    {
      key: 'duplicate',
      label: t('todos.duplicate'),
      onClick: () => onDuplicate(todo),
      children: <Copy className="h-3 w-3" />,
    },
    {
      key: 'edit',
      label: t('todos.editTodo'),
      onClick: () => onEdit(todo),
      children: <Pencil className="h-3 w-3" />,
    },
    {
      key: 'delete',
      label: t('todos.deleteAria'),
      onClick: () => onDelete(todo),
      children: <Trash2 className="h-3 w-3" />,
      destructive: true,
    },
  ]

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
      className={`group relative gap-0 py-0 ${closed ? 'opacity-60' : ''} ${canNest && nestHover ? 'ring-2 ring-primary/70 bg-primary/5' : ''}`}
      style={todo.color ? { borderLeftColor: todo.color, borderLeftWidth: '3px' } : undefined}
      onDragOver={(e) => {
        if (!canNest) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setNestHover(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setNestHover(false)
      }}
      onDrop={(e) => {
        if (!canNest) return
        // Subtask rows stop their own dragover/drop, so reaching here means
        // the pointer released on the card body itself → nest under it.
        e.preventDefault()
        e.stopPropagation()
        onNestSubtask!(subtaskDragId!, todo.id)
        setNestHover(false)
      }}
    >
      <CardContent className={compact ? 'p-1.5' : 'p-1.5 space-y-1'}>
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
              // span 而非 button:标题内可渲染 Markdown 链接,锚点按规范不能
              // 嵌套在 button(交互内容)里;键盘 Enter/Space 直接开抽屉。
              <span
                role="button"
                tabIndex={0}
                onClick={() => {
                  cancelPendingTitleClick()
                  titleClickTimer.current = window.setTimeout(() => {
                    titleClickTimer.current = null
                    onEdit(todo)
                  }, 200)
                }}
                onDoubleClick={() => {
                  cancelPendingTitleClick()
                  startRename()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onEdit(todo)
                  }
                }}
                className={`block max-w-full text-left text-sm font-medium leading-snug cursor-text ${closed ? 'line-through text-muted-foreground' : ''}`}
                title={todo.title}
              >
                <InlineMarkdown text={todo.title} />
              </span>
            )}
            {todo.description && !compact && (
              <p className="text-[11px] leading-snug text-muted-foreground line-clamp-1">
                <InlineMarkdown text={todo.description} />
              </p>
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
                items) — complements the item_done chip above. In the flat
                views (subtasks wired) the chip is also the fold toggle for
                the card's subtask list, mirroring the kanban chip below. */}
            {subtaskProgress && subtaskProgress.total > 0 && (subtasks ? (
              <button
                type="button"
                onClick={() => toggleCollapse(collapseScope, todo.id)}
                aria-expanded={!sectionFolded}
                title={t('todos.subtaskProgress', { done: subtaskProgress.done, total: subtaskProgress.total })}
                className={cn(
                  'flex items-center gap-1 rounded tabular-nums hover:bg-muted/60',
                  subtaskProgress.done === subtaskProgress.total ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
                )}
              >
                <ListTree className="h-3 w-3" />
                {subtaskProgress.done}/{subtaskProgress.total}
                <ChevronDown className={cn('h-3 w-3 transition-transform', !sectionFolded && 'rotate-180')} />
              </button>
            ) : (
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
            ))}
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
      </CardContent>
      {subtasks && (compact ? subtasksOpen : !sectionFolded) && subtasks}
      {addingChild && onCreateChild && (
        <div className={compact ? 'px-1.5 pb-1.5' : 'px-2 pb-2'}>
          <AddChildInput
            placeholder={t('todos.addSubtaskPlaceholder')}
            onCommit={(v) => {
              onCreateChild(todo, v)
              // Kanban keeps the list hidden behind the chip — opening it is
              // what makes the freshly added subtask visible.
              if (compact) setSubtasksOpen(true)
            }}
            onDismiss={() => setAddingChild(false)}
            className="text-xs"
          />
        </div>
      )}

      {/* Action toolbar — floating top-right so it costs no row height and no
          reserved text gap. On md+ it's revealed only when the pointer reaches
          the toolbar's own strip (focus-within covers keyboard). */}
      <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded-md border bg-background/95 px-0.5 shadow-sm opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 md:flex">
        {actions.map((a) => (
          <Button
            key={a.key}
            variant="ghost"
            size="sm"
            className={a.btnClass ?? (a.destructive ? 'h-5 w-5 p-0 text-destructive' : 'h-5 w-5 p-0')}
            onClick={a.onClick}
            aria-label={a.label}
            title={a.label}
          >
            {a.children}
          </Button>
        ))}
      </div>
      {/* Small screens: the 8-button strip would cover the title/meta — the
          same actions live in a kebab menu instead. */}
      <div className="absolute right-1 top-1 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                aria-label={t('common.more')}
                title={t('common.more')}
              />
            }
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((a) => (
              <DropdownMenuItem
                key={a.key}
                onClick={a.onClick}
                className={a.destructive ? 'text-destructive focus:text-destructive' : undefined}
              >
                <span className="mr-1.5 inline-flex w-3.5 items-center justify-center">{a.children}</span>
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
})

export default TodoCard
