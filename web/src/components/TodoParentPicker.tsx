import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Circle, CheckCircle2, Ban, CornerDownRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTodosList } from '../hooks/api/useTodos'
import type { Todo } from '../types'

// Searchable parent-task picker (TodoForm's 父任务 field): a combobox that
// filters the loaded candidates instantly and — once the user types — searches
// the whole workspace through the list API (q matches title OR description), so
// a parent that isn't in the current view can still be found. Self and
// descendants are excluded client-side (the backend rejects those moves too).

export interface TodoParentPickerProps {
  value: number | null
  onChange: (parentId: number | null) => void
  /** Loaded todos offered instantly, before any server search kicks in. */
  candidates: Todo[]
  /** Disallowed parents: the edited todo itself plus all its descendants. */
  blocked: Set<number>
}

export default function TodoParentPicker({ value, onChange, candidates, blocked }: TodoParentPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  // Remember the title of the parent picked this session so the closed state
  // stays readable even after the option list no longer contains it.
  const [picked, setPicked] = useState<{ id: number; title: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce the typed query — one request per pause, not per keystroke.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(handle)
  }, [query])

  const { data: results, isFetching } = useTodosList(
    { q: debounced || undefined, page_size: 20 },
    { enabled: debounced.length > 0 },
  )

  // Local candidates filter instantly; server results (whole workspace) merge
  // in once the debounced query lands. Blocked/self never appear.
  const options = useMemo(() => {
    const seen = new Set<number>(blocked)
    const out: Todo[] = []
    const add = (todo: Todo) => {
      if (seen.has(todo.id)) return
      seen.add(todo.id)
      out.push(todo)
    }
    const needle = query.trim().toLowerCase()
    for (const todo of candidates) {
      if (!needle || todo.title.toLowerCase().includes(needle)) add(todo)
    }
    if (debounced) {
      for (const todo of results?.items ?? []) add(todo)
    }
    return out.slice(0, 30)
  }, [candidates, query, debounced, results, blocked])

  // Options + the leading "no parent" row = the keyboard-navigable rows. The
  // highlight is clamped at use/render time (not in an effect) so a shrunken
  // list can't leave it out of range.
  const rowCount = options.length + 1
  const hl = Math.min(highlight, rowCount - 1)

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // The closed state shows the selected parent's title: from the loaded
  // candidates, the search results, or the remembered pick — else its id.
  const knownTitle = useMemo(() => {
    if (value == null) return null
    if (picked?.id === value) return picked.title
    const local = candidates.find((c) => c.id === value)?.title
    if (local) return local
    return results?.items?.find((c) => c.id === value)?.title ?? `#${value}`
  }, [value, picked, candidates, results])

  const choose = (parentId: number | null, title?: string) => {
    onChange(parentId)
    if (parentId != null && title) setPicked({ id: parentId, title })
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (Math.min(h, rowCount - 1) + 1) % rowCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (Math.min(h, rowCount - 1) - 1 + rowCount) % rowCount)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hl === 0) choose(null)
      else {
        const todo = options[hl - 1]
        if (todo) choose(todo.id, todo.title)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const rowClass = (active: boolean) =>
    cn('flex w-full cursor-pointer items-center gap-1.5 px-2 py-1 text-left text-sm', active && 'bg-accent text-accent-foreground')

  return (
    <div ref={rootRef} className="relative">
      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setHighlight(0) }}
          className="flex h-8 w-full items-center justify-between gap-1 rounded-md border bg-background px-2 text-sm"
          aria-label={t('todos.parent')}
        >
          <span className="flex min-w-0 items-center gap-1">
            {value != null && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className={cn('truncate', value == null && 'text-muted-foreground')}>
              {value == null ? t('todos.parentNone') : knownTitle}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="w-full space-y-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              // With a query in flight, Enter should pick the first MATCH, not
              // the "no parent" row — otherwise clearing is one keypress away.
              setHighlight(e.target.value.trim() ? 1 : 0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t('todos.parentSearchPlaceholder')}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
            aria-label={t('todos.parent')}
          />
          <div className="absolute inset-x-0 top-full z-20 max-h-60 overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
            <button
              type="button"
              className={rowClass(hl === 0)}
              onClick={() => choose(null)}
            >
              <span className="text-muted-foreground">{t('todos.parentNone')}</span>
            </button>
            {options.map((todo, i) => (
              <button
                key={todo.id}
                type="button"
                className={rowClass(hl === i + 1)}
                onClick={() => choose(todo.id, todo.title)}
              >
                {todo.status === 'done' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : todo.status === 'abandoned' ? (
                  <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn('truncate', todo.status !== 'pending' && 'text-muted-foreground line-through')}>{todo.title}</span>
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-2 py-1 text-sm text-muted-foreground">{t('todos.parentNoResults')}</div>
            )}
            {isFetching && debounced && (
              <div className="px-2 py-1 text-xs text-muted-foreground">{t('todos.parentSearching')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
