import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, ChevronDown, Circle, Link2, Plus, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTodoDetails, useTodosList } from '../hooks/api/useTodos'
import type { Todo } from '../types'

// Multi-select todo-link picker (TodoForm's 链接任务 field). Mirrors
// TodoParentPicker's interaction model — instant filter over the loaded
// candidates, whole-workspace search once you type — but toggles a set instead
// of replacing one value. Selected targets the current view hasn't loaded
// resolve their titles through the shared detail cache.

export interface TodoLinkPickerProps {
  value: number[]
  onChange: (ids: number[]) => void
  /** Loaded todos offered instantly, before any server search kicks in. */
  candidates: Todo[]
  /** Disallowed targets — the edited todo itself (no self-links). */
  blocked?: Set<number>
  disabled?: boolean
}

export default function TodoLinkPicker({ value, onChange, candidates, blocked, disabled }: TodoLinkPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
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

  // Titles for already-selected targets: loaded candidates first, then the
  // detail cache for targets outside the current view.
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const unknownIds = useMemo(
    () => value.filter((id) => !byId.has(id)),
    [value, byId],
  )
  const { todos: fetched } = useTodoDetails(unknownIds)
  const titleOf = (id: number) => byId.get(id)?.title ?? fetched.get(id)?.title ?? `#${id}`

  // Option list: local candidates filter instantly; server results (whole
  // workspace) merge in once the debounced query lands. Blocked targets and
  // already-selected ones never appear as addable options.
  const options = useMemo(() => {
    const seen = new Set<number>([...(blocked ?? []), ...value])
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
  }, [candidates, query, debounced, results, blocked, value])

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

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
    // Stay open (multi-select) but clear the filter so the next search starts
    // from the full list — a stale "中心" would keep showing no results.
    setQuery('')
    setDebounced('')
  }

  const rowClass = 'flex w-full cursor-pointer items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground'

  return (
    <div ref={rootRef} className="relative">
      {/* Closed state: chips of the selected targets + an add button. */}
      {!open ? (
        <div className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border bg-background px-1.5 py-1">
          {value.length === 0 && (
            <span className="px-0.5 text-sm text-muted-foreground">{t('todos.linkNone')}</span>
          )}
          {value.map((id) => (
            <span
              key={id}
              className="flex max-w-full items-center gap-0.5 rounded bg-muted px-1.5 py-px text-xs"
            >
              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{titleOf(id)}</span>
              {!disabled && (
                <button
                  type="button"
                  className="shrink-0 rounded-sm p-px text-muted-foreground hover:text-foreground"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  aria-label={t('todos.linkRemove')}
                  title={t('todos.linkRemove')}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => { setOpen(true); setQuery('') }}
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t('todos.linkAdd')}
            title={t('todos.linkAdd')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-full space-y-1">
          <div className="flex h-8 w-full items-center gap-1 rounded-md border bg-background px-2">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
              placeholder={t('todos.linkSearchPlaceholder')}
              className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label={t('todos.links')}
            />
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="absolute inset-x-0 top-full z-20 max-h-60 overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
            {options.map((todo) => (
              <button
                key={todo.id}
                type="button"
                className={rowClass}
                onClick={() => toggle(todo.id)}
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
            {options.length === 0 && (
              <div className="px-2 py-1 text-sm text-muted-foreground">{t('todos.linkNoResults')}</div>
            )}
            {isFetching && debounced && (
              <div className="px-2 py-1 text-xs text-muted-foreground">{t('todos.linkSearching')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
