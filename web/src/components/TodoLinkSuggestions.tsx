import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import type { Todo } from '../types'

// Suggestion popover for the todo form's "[[" task autocomplete
// (useTodoLinkMention). Rendered absolutely under the field; rows mirror the
// parent picker's status icons so the two pickers read as one family.

export interface TodoLinkSuggestionsProps {
  open: boolean
  items: Todo[]
  highlight: number
  isFetching: boolean
  onPick: (todo: Todo) => void
  onHighlight: (index: number) => void
}

export function TodoLinkSuggestions({ open, items, highlight, isFetching, onPick, onHighlight }: TodoLinkSuggestionsProps) {
  const { t } = useTranslation()
  if (!open) return null
  const hl = Math.min(highlight, Math.max(items.length - 1, 0))

  return (
    <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover py-1 shadow-md" role="listbox" aria-label={t('todos.links')}>
      {items.map((todo, i) => (
        <button
          key={todo.id}
          type="button"
          role="option"
          aria-selected={i === hl}
          // preventDefault keeps the host input focused so the caret (and the
          // insert logic, which reads it) survives the pick.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(todo)}
          onMouseEnter={() => onHighlight(i)}
          className={cn(
            'flex w-full cursor-pointer items-center gap-1.5 px-2 py-1 text-left text-sm',
            i === hl && 'bg-accent text-accent-foreground',
          )}
        >
          {todo.status === 'done' ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : todo.status === 'abandoned' ? (
            <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={cn('truncate', todo.status !== 'pending' && 'text-muted-foreground line-through')}>
            {todo.title}
          </span>
        </button>
      ))}
      {items.length === 0 && (
        <div className="px-2 py-1 text-sm text-muted-foreground">{t('todos.linkNoResults')}</div>
      )}
      {isFetching && (
        <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('todos.linkSearching')}
        </div>
      )}
    </div>
  )
}
