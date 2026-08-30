import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, Circle, Plus, Timer, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import { formatDueLabel } from '../lib/dueLabel'
import { AddChildInput } from './AddChildInput'
import type { Todo } from '../types'

export interface TodoSubtaskListProps {
  todo: Todo
  childrenByParent: Map<number, Todo[]>
  onToggle: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  /** Inline quick-add: type + Enter creates the child directly (no dialog).
   *  When wired, every row's "+" opens an inline adder for THAT row — at any
   *  depth; otherwise no add affordance is rendered. */
  onCreateChild?: (parent: Todo, title: string) => void
  /** Delete routes through the page's confirm dialog when provided. */
  onDelete?: (todo: Todo) => void
  onStartPomodoro?: (todo: Todo) => void
}

/**
 * TodoSubtaskList renders a todo's subtasks — recursively, at any depth —
 * beneath the parent's card in the flat views (timeline / grouped) and the
 * detail drawer. Every row gets the same feature set regardless of depth:
 * toggle, due label, progress, pomodoro, add-child, delete.
 */
export default function TodoSubtaskList({ todo, childrenByParent, onToggle, onEdit, onCreateChild, onDelete, onStartPomodoro }: TodoSubtaskListProps) {
  const { t } = useTranslation()
  const children = childrenByParent.get(todo.id)
  // Id of the todo the inline adder targets (the section's own todo for the
  // trailing "add child" row, or a clicked row's todo). null = hidden.
  const [addingFor, setAddingFor] = useState<number | null>(null)

  // With the inline adder wired, the section is useful even before the first
  // child exists — that's exactly when "add a subtask" is needed most.
  const showAdder = onCreateChild != null
  if (!children?.length && !showAdder) return null

  const rowAdder = addingFor != null && addingFor !== todo.id
    ? children?.find((c) => c.id === addingFor)
    : undefined

  return (
    <div className="mt-1 space-y-1 border-l-2 border-border pl-2">
      {children?.map((child) => (
        <div key={child.id}>
          <div className="group/sub flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60">
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => onToggle(child)}
              aria-label={child.status === 'pending' ? t('todos.markDone') : t('todos.markPending')}
            >
              {child.status === 'done'
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                : child.status === 'abandoned'
                  ? <Ban className="h-3.5 w-3.5" />
                  : <Circle className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className={`min-w-0 flex-1 truncate text-left text-xs ${child.status !== 'pending' ? 'text-muted-foreground line-through' : ''}`}
              onClick={() => onEdit(child)}
              title={child.title}
            >
              {child.title}
            </button>
            {child.due_time && (
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap text-[10px]',
                  child.status === 'pending' && new Date(child.due_time) < new Date()
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {formatDueLabel(child.due_time, new Date(), t)}
              </span>
            )}
            {!!childrenByParent.get(child.id)?.length && (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {childrenByParent.get(child.id)!.filter((c) => c.status === 'done').length}/{childrenByParent.get(child.id)!.length}
              </span>
            )}
            {onStartPomodoro && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity group-hover/sub:opacity-100"
                onClick={() => onStartPomodoro(child)}
                aria-label={t('todos.pomoStart')}
                title={t('todos.pomoStart')}
              >
                <Timer className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/sub:opacity-100"
                onClick={() => onDelete(child)}
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            {onCreateChild && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 shrink-0 p-0 opacity-0 transition-opacity group-hover/sub:opacity-100"
                onClick={() => setAddingFor(child.id)}
                aria-label={t('todos.addChild')}
                title={t('todos.addChild')}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
          {/* Recurse: grandchildren render indented under their own parent row,
              with the same controls as any other depth. */}
          <div className="pl-4">
            <TodoSubtaskList
              todo={child}
              childrenByParent={childrenByParent}
              onToggle={onToggle}
              onEdit={onEdit}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onStartPomodoro={onStartPomodoro}
            />
          </div>
          {/* Row-level inline adder: new child of THIS row. */}
          {rowAdder?.id === child.id && (
            <div className="pl-6 py-0.5">
              <AddChildInput
                placeholder={t('todos.addSubtaskPlaceholder')}
                onCommit={(v) => onCreateChild!(child, v)}
                onDismiss={() => setAddingFor(null)}
                className="text-xs"
              />
            </div>
          )}
        </div>
      ))}
      {showAdder && (addingFor === todo.id ? (
        <AddChildInput
          placeholder={t('todos.addSubtaskPlaceholder')}
          onCommit={(v) => onCreateChild!(todo, v)}
          onDismiss={() => setAddingFor(null)}
          className="text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingFor(todo.id)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('todos.addChild')}
        </button>
      ))}
    </div>
  )
}

