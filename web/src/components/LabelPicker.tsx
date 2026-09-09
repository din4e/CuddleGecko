import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Loader2, Plus, Search, Tags, X } from 'lucide-react'
import { useCreateTag, useTagSearch } from '../hooks/api/useTags'
import { cn } from '../lib/utils'
import type { Tag } from '../types'

interface LabelPickerProps {
  value: number[]
  onChange: (ids: number[]) => void
  candidates: Tag[]
  disabled?: boolean
  onPendingChange: (pending: boolean) => void
}

/** Entity-agnostic workspace-wide label picker, styled like the parent picker,
 * with persistent multi-selection. The portalled popup stays visible inside a
 * scrolling drawer. Shared by todos, events, transactions, workouts, habits
 * and reminders — labels live on the polymorphic taggings table. */
export default function LabelPicker({ value, onChange, candidates, disabled, onPendingChange }: LabelPickerProps) {
  const { t } = useTranslation()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const creatingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [remembered, setRemembered] = useState<Tag[]>([])
  const [createError, setCreateError] = useState(false)
  const search = useTagSearch(debounced, open)
  const createTag = useCreateTag()
  const needle = query.trim().toLowerCase()

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const known = useMemo(() => {
    const map = new Map<number, Tag>()
    for (const tag of [...candidates, ...remembered]) map.set(tag.id, tag)
    for (const page of search.data?.pages ?? []) {
      for (const tag of page.items ?? []) map.set(tag.id, tag)
    }
    return map
  }, [remembered, candidates, search.data])
  const selected = new Set(value)
  const options = [...known.values()].filter((tag) => tag.name.toLowerCase().includes(needle))
  const active = Math.min(highlight, Math.max(0, options.length - 1))
  const searching = needle !== debounced || search.isFetching
  const exactMatch = options.some((tag) => tag.name.toLowerCase() === needle)
  // An exact match may still be on an unloaded page. Offer creation only once
  // this search is complete, so a partial library never looks like a new label.
  const canCreate = !!needle && !exactMatch && !searching && search.isSuccess && !search.hasNextPage
  const busy = !!disabled || createTag.isPending

  useEffect(() => {
    if (open && !busy) inputRef.current?.focus()
  }, [open, busy])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active, query])

  const toggle = (tag: Tag) => {
    if (busy) return
    setRemembered((prev) => [...prev.filter((item) => item.id !== tag.id), tag])
    onChange(selected.has(tag.id) ? value.filter((id) => id !== tag.id) : [...value, tag.id])
    inputRef.current?.focus()
  }

  const create = async () => {
    if (!canCreate || busy || creatingRef.current) return
    creatingRef.current = true
    onPendingChange(true)
    setCreateError(false)
    try {
      const { data: tag } = await createTag.mutateAsync({ name: query.trim(), color: '#22c55e' })
      setRemembered((prev) => [...prev.filter((item) => item.id !== tag.id), tag])
      onChange([...new Set([...value, tag.id])])
      setQuery('')
      setDebounced('')
      setHighlight(0)
      inputRef.current?.focus()
    } catch {
      // The shared mutation cache toasts the API error; retain the query so
      // retrying never requires the user to type the label again.
      setCreateError(true)
      void search.refetch()
    } finally {
      creatingRef.current = false
      onPendingChange(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Popover.Root open={open} onOpenChange={(next) => {
        if (creatingRef.current) return
        setOpen(next)
        setQuery('')
        setDebounced('')
        setHighlight(0)
        setCreateError(false)
      }}>
        <Popover.Trigger
          disabled={busy}
          aria-label={t('labels.title')}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-sm outline-none transition-colors hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Tags className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
              {value.length ? t('labels.selected', { count: value.length }) : t('labels.placeholder')}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner align="start" sideOffset={4} className="z-[60] outline-none">
            <Popover.Popup initialFocus={inputRef} aria-label={t('labels.title')} className="flex max-h-(--available-height) w-(--anchor-width) max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md outline-none">
              <div className="flex shrink-0 items-center gap-1.5 border-b px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  disabled={busy}
                  maxLength={50}
                  placeholder={t('labels.searchPlaceholder')}
                  aria-label={t('labels.searchPlaceholder')}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={options.length ? `${listId}-${options[active].id}` : undefined}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  onChange={(event) => { setQuery(event.target.value); setHighlight(0); setCreateError(false) }}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      if (options.length) setHighlight((active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      if (options[active]) toggle(options[active])
                      else void create()
                    }
                  }}
                />
                {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label={t('labels.searching')} />}
              </div>
              <div ref={listRef} id={listId} role="listbox" aria-label={t('labels.title')} aria-multiselectable="true" className="min-h-0 max-h-52 overflow-y-auto p-1">
                {options.map((tag, index) => (
                  <button
                    key={tag.id}
                    id={`${listId}-${tag.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected.has(tag.id)}
                    data-active={index === active}
                    disabled={busy}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { setHighlight(index); toggle(tag) }}
                    className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50', index === active && 'bg-accent')}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color || '#6b7280' }} />
                    <span className="min-w-0 flex-1 break-words">{tag.name}</span>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected.has(tag.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                      {selected.has(tag.id) && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                ))}
                {!options.length && !searching && !search.isError && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">{needle ? t('labels.noResults') : t('labels.empty')}</p>
                )}
              </div>
              {search.hasNextPage && (
                <button type="button" disabled={searching || busy} onClick={() => { void search.fetchNextPage() }} className="px-3 py-2 text-xs text-primary disabled:opacity-50">{t('labels.loadMore')}</button>
              )}
              {search.isError && (
                <button type="button" onClick={() => { void search.refetch() }} className="px-3 py-2 text-xs text-destructive">{t('labels.loadError')}</button>
              )}
              {(canCreate || createTag.isPending) && (
                <button type="button" disabled={busy} onClick={() => { void create() }} className="flex items-center gap-1.5 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent disabled:opacity-50">
                  {createTag.isPending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 break-words">{t('labels.create', { name: query.trim() })}</span>
                </button>
              )}
              {createError && <p role="alert" className="px-3 py-2 text-xs text-destructive">{t('labels.createError')}</p>}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
                <span>{t('labels.hint')}</span>
                <Popover.Close disabled={busy} className="rounded px-1 text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('labels.done')}</Popover.Close>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t('labels.selected', { count: value.length })}>
          {value.map((id) => {
            const tag = known.get(id)
            const name = tag?.name ?? `#${id}`
            return (
              <span key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/30 py-0.5 pl-2 pr-1 text-xs">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag?.color || '#6b7280' }} />
                <span className="min-w-0 break-words">{name}</span>
                <button type="button" disabled={busy} onClick={() => onChange(value.filter((item) => item !== id))} aria-label={t('labels.remove', { name })} className="shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
