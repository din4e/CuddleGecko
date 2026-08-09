import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, Clock, CalendarClock, ListTodo, Repeat, ArrowRight, Copy, Pencil, Trash2, Star, CornerDownRight } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
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
  onTogglePin: (todo: Todo) => void
  onSync: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  onRename: (id: number, title: string) => void
  onDuplicate: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  formatDate: (dateStr: string | null) => string
  parentTitle?: string
}

const TodoCard = memo(function TodoCard({
  todo,
  compact = false,
  contactNames,
  selectable = false,
  selected = false,
  onSelectToggle,
  onToggle,
  onTogglePin,
  onSync,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  formatDate,
  parentTitle,
}: TodoCardProps) {
  const { t } = useTranslation()
  const [editingTitle, setEditingTitle] = useState(false)
  const [draft, setDraft] = useState('')

  const priorityLabel = t(`todos.${todo.priority}`)
  const syncLabel = t('todos.syncToEvent')
  const repeatLabel = repeatLabelOf(t, todo.repeat)

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
      className={`${todo.status === 'done' ? 'opacity-60' : ''} ${compact ? 'p-2' : ''}`}
      style={todo.color ? { borderLeftColor: todo.color, borderLeftWidth: '3px' } : undefined}
    >
      <CardContent className={`${compact ? 'p-2 space-y-1' : 'p-3 space-y-2'}`}>
        <div className="flex items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelectToggle?.(todo.id)}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
              aria-label={todo.title}
            />
          )}
          <button
            onClick={() => onToggle(todo.id)}
            aria-label={todo.status === 'done' ? t('todos.markPending') : t('todos.markDone')}
            className="mt-0.5 shrink-0 cursor-pointer bg-transparent border-none"
          >
            {todo.status === 'done'
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />}
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
              <span
                onDoubleClick={startRename}
                className={`text-sm font-medium cursor-text ${todo.status === 'done' ? 'line-through text-muted-foreground' : ''}`}
                title={todo.title}
              >
                {todo.title}
              </span>
            )}
            {todo.description && !compact && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{todo.description}</p>
            )}
          </div>
          {todo.pinned && (
            <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-label={t('todos.pinned')} />
          )}
          <Badge variant="secondary" className={`text-xs shrink-0 ${priorityConfig[todo.priority]?.bg || ''}`}>
            <span className={priorityConfig[todo.priority]?.color}>{priorityLabel}</span>
          </Badge>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {parentTitle && (
              <span className="flex items-center gap-0.5 text-muted-foreground/80">
                <CornerDownRight className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{parentTitle}</span>
              </span>
            )}
            {todo.due_time && (
              <span className={`flex items-center gap-1 ${todo.status === 'pending' && new Date(todo.due_time) < new Date() ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                <Clock className="h-3 w-3" />
                {formatDate(todo.due_time)}
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
            {todo.repeat && repeatLabel && (
              <span className="flex items-center gap-1 text-primary">
                <Repeat className="h-3 w-3" />
                {repeatLabel}
              </span>
            )}
            {todo.amount != null && todo.amount > 0 && (
              <Badge variant="outline" className={todo.amount_type === 'income' ? 'text-green-600' : 'text-red-600'}>
                {todo.amount_type === 'income' ? '+' : '-'}{todo.amount}
              </Badge>
            )}
            {todo.contact_ids?.length > 0 && contactNames && (
              <span>{contactNames}</span>
            )}
          </div>
        )}

        {!compact && (todo.item_total ?? 0) > 0 && (
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={todo.item_done ?? 0} aria-valuemin={0} aria-valuemax={todo.item_total ?? 0}>
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
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: (tag.color || '#9ca3af') + '22', color: tag.color || '#6b7280' }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {!compact && (
          <div className="flex items-center gap-1 pt-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onTogglePin(todo)} aria-label={t('todos.pinAria')}>
              <Star className={`h-3.5 w-3.5 ${todo.pinned ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onSync(todo)} aria-label={syncLabel}>
              <ArrowRight className="h-3 w-3 mr-1" />
              {syncLabel}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onDuplicate(todo)} aria-label={t('todos.duplicate')}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onEdit(todo)} aria-label={t('todos.editTodo')}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => onDelete(todo)} aria-label={t('todos.deleteAria')}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

export default TodoCard
