import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTodoDetails } from '../hooks/api/useTodos'
import type { Todo } from '../types'

// Read-only link chips: the display side of a todo's todo_ids set. Titles
// resolve from the caller's loaded todos first (instant), then the shared
// detail cache for targets outside the current view. Clicking a chip jumps to
// that todo (the todos page opens its detail drawer).

export interface TodoLinkChipsProps {
  ids: number[]
  onOpen?: (id: number) => void
  /** Loaded todos used for instant title resolution. */
  candidates?: Todo[]
  /** Chip size: 'xs' matches the card meta row, 'sm' the drawer sections. */
  size?: 'xs' | 'sm'
  className?: string
}

export const TodoLinkChips = memo(function TodoLinkChips({
  ids,
  onOpen,
  candidates,
  size = 'xs',
  className,
}: TodoLinkChipsProps) {
  const { t } = useTranslation()
  const byId = useMemo(() => new Map((candidates ?? []).map((c) => [c.id, c])), [candidates])
  const unknownIds = useMemo(
    () => ids.filter((id) => !byId.has(id)),
    [ids, byId],
  )
  const { todos: fetched, pending } = useTodoDetails(unknownIds)
  if (ids.length === 0) return null

  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-1', className)}>
      {ids.map((id) => {
        const target = byId.get(id) ?? fetched.get(id)
        const settled = target != null && target.status !== 'pending'
        if (!target) {
          if (pending.has(id)) {
            // Title still loading — a spinner chip, not the dead-reference
            // look below (which would read as a broken link for a beat).
            return (
              <span
                key={id}
                className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1 py-px text-muted-foreground"
              >
                <Loader2 className={size === 'xs' ? 'h-2.5 w-2.5 animate-spin' : 'h-3 w-3 animate-spin'} />
              </span>
            )
          }
          // Never resolved: trashed / deleted / cross-workspace. Kept visible
          // (as a dead reference) but not clickable.
          return (
            <span
              key={id}
              className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1 py-px text-muted-foreground/70"
              title={t('todos.linkBroken')}
            >
              <Link2 className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              #{id}
            </span>
          )
        }
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen?.(id)
            }}
            disabled={!onOpen}
            aria-label={t('todos.jumpToTodo')}
            title={t('todos.jumpToTodo')}
            className={cn(
              'inline-flex max-w-[220px] items-center gap-0.5 rounded bg-muted px-1 py-px text-primary transition-colors hover:bg-primary/15',
              size === 'xs' ? 'text-[10px] leading-tight' : 'text-xs',
              settled && 'opacity-70',
            )}
          >
            <Link2 className={size === 'xs' ? 'h-2.5 w-2.5 shrink-0' : 'h-3 w-3 shrink-0'} />
            <span className={cn('truncate', settled && 'line-through')}>{target.title}</span>
          </button>
        )
      })}
    </span>
  )
})

export default TodoLinkChips
