import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, CornerDownRight, Plus } from 'lucide-react'
import { Button } from './ui/button'
import type { Todo } from '../types'

export interface TodoSubtaskListProps {
  todo: Todo
  childrenByParent: Map<number, Todo[]>
  onToggle: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  onAddChild: (todo: Todo) => void
}

/**
 * TodoSubtaskList renders a todo's subtasks — recursively, at any depth —
 * beneath the parent's card in the flat views (timeline / grouped / kanban).
 * Mirrors the tree view's semantics: children whose own parent is filtered out
 * of the current list never reach this component (the page only renders
 * top-level cards and their descendant chains).
 */
export default function TodoSubtaskList({ todo, childrenByParent, onToggle, onEdit, onAddChild }: TodoSubtaskListProps) {
  const { t } = useTranslation()
  const children = childrenByParent.get(todo.id)
  if (!children?.length) return null

  return (
    <div className="mt-1 space-y-1 border-l-2 border-border pl-2">
      {children.map((child) => (
        <div key={child.id}>
          <div className="group/sub flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60">
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => onToggle(child)}
              aria-label={child.status === 'done' ? t('todos.markPending') : t('todos.markDone')}
            >
              {child.status === 'done'
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                : <Circle className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className={`min-w-0 flex-1 truncate text-left text-xs ${child.status === 'done' ? 'text-muted-foreground line-through' : ''}`}
              onClick={() => onEdit(child)}
              title={child.title}
            >
              {child.title}
            </button>
            {!!childrenByParent.get(child.id)?.length && (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {childrenByParent.get(child.id)!.filter((c) => c.status === 'done').length}/{childrenByParent.get(child.id)!.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 shrink-0 p-0 opacity-0 transition-opacity group-hover/sub:opacity-100"
              onClick={() => onAddChild(child)}
              aria-label={t('todos.addChild')}
              title={t('todos.addChild')}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {/* Recurse: grandchildren render indented under their own parent row. */}
          <div className="pl-4">
            <TodoSubtaskList
              todo={child}
              childrenByParent={childrenByParent}
              onToggle={onToggle}
              onEdit={onEdit}
              onAddChild={onAddChild}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Marker icon re-export keeps callers from importing lucide directly for the
 *  "has subtasks" affordance if they need one. */
export { CornerDownRight }
