import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  Bell,
  Calendar,
  Dumbbell,
  Flame,
  Heart,
  ListChecks,
  Loader2,
  MessageCircle,
  Presentation,
  Search,
  Tag,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { useGlobalSearch } from '../hooks/api/useSearch'
import { cn } from '@/lib/utils'
import type { SearchEntityType, SearchHit } from '../types'

const TYPE_ICONS: Record<SearchEntityType, LucideIcon> = {
  contact: Heart,
  interaction: MessageCircle,
  reminder: Bell,
  event: Calendar,
  todo: ListChecks,
  workout: Dumbbell,
  transaction: Wallet,
  habit: Flame,
  tag: Tag,
  body_metric: Activity,
  whiteboard: Presentation,
}

const TYPE_ORDER: SearchEntityType[] = [
  'contact',
  'todo',
  'event',
  'interaction',
  'reminder',
  'transaction',
  'workout',
  'habit',
  'body_metric',
  'whiteboard',
  'tag',
]

/** Where a hit navigates: the deepest page that can show the entity. */
function routeForHit(hit: SearchHit): string {
  switch (hit.type) {
    case 'contact':
      return `/buddies/${hit.id}`
    case 'interaction':
      return hit.contact_id ? `/buddies/${hit.contact_id}` : '/buddies'
    case 'reminder':
      return hit.contact_id ? `/buddies/${hit.contact_id}` : '/reminders'
    case 'todo':
      return '/todos'
    case 'event':
      return '/events'
    case 'workout':
    case 'body_metric':
      return '/fitness'
    case 'transaction':
      return '/finance'
    case 'habit':
      return '/habits'
    case 'tag':
      return '/tags'
    case 'whiteboard':
      return '/whiteboard'
  }
}

/** Wraps every case-insensitive occurrence of `query` in <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts: Array<{ text: string; match: boolean }> = []
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(needle, i)
    if (idx < 0) {
      parts.push({ text: text.slice(i), match: false })
      break
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), match: false })
    parts.push({ text: text.slice(idx, idx + needle.length), match: true })
    i = idx + needle.length
  }
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-primary/15 px-0.5 text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform)
}

/**
 * Global search palette (⌘K / Ctrl+K, or the header button). One query fans
 * out across every entity type server-side; results are grouped by type with
 * keyboard navigation and match highlighting.
 */
export default function GlobalSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const trimmed = q.trim()
  const { data, isFetching } = useGlobalSearch({ q })
  const hits = useMemo(() => data?.hits ?? [], [data])

  const grouped = useMemo(() => {
    const byType = new Map<SearchEntityType, SearchHit[]>()
    for (const hit of hits) {
      const list = byType.get(hit.type) ?? []
      list.push(hit)
      byType.set(hit.type, list)
    }
    // Display order follows TYPE_ORDER; types absent from it keep arrival order.
    const ordered = [...byType.entries()].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0])
      const ib = TYPE_ORDER.indexOf(b[0])
      return (ia < 0 ? TYPE_ORDER.length : ia) - (ib < 0 ? TYPE_ORDER.length : ib)
    })
    return ordered
  }, [hits])

  const flat = useMemo(() => grouped.flatMap(([, list]) => list), [grouped])

  // Global shortcut: ⌘K / Ctrl+K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      // Defer so the dialog popup has mounted before focusing its input.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQ('')
      setActiveIndex(0)
    }
  }

  const go = (hit: SearchHit) => {
    handleOpenChange(false)
    navigate(routeForHit(hit))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      const hit = flat[activeIndex]
      if (hit) {
        e.preventDefault()
        go(hit)
      }
    }
  }

  // Keep the active row in view while arrowing through long lists.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const shortcutLabel = isMac() ? '⌘K' : 'Ctrl K'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-muted-foreground transition-colors hover:bg-muted sm:w-60"
        aria-label={t('search.open')}
        title={t('search.open')}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate text-sm sm:inline">{t('search.placeholder')}</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          {shortcutLabel}
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="gap-0 p-0 sm:max-w-xl"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                // New query → restart the keyboard cursor from the top.
                setActiveIndex(0)
              }}
              onKeyDown={onKeyDown}
              placeholder={t('search.placeholder')}
              aria-label={t('search.title')}
              role="combobox"
              aria-expanded="true"
              aria-controls="global-search-results"
              aria-activedescendant={
                flat.length > 0 ? `global-search-option-${activeIndex}` : undefined
              }
              className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching && trimmed && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          <div
            ref={listRef}
            id="global-search-results"
            role="listbox"
            aria-label={t('search.title')}
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {!trimmed && (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                {t('search.hint')}
              </div>
            )}

            {trimmed && !isFetching && flat.length === 0 && (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                {t('search.noResults', { query: trimmed })}
              </div>
            )}

            {trimmed && isFetching && flat.length === 0 && (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                {t('search.searching')}
              </div>
            )}

            {grouped.map(([type, list]) => (
              <div key={type} className="mb-1 last:mb-0">
                <div className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`search.types.${type}`)} · {list.length}
                </div>
                {list.map((hit) => {
                  const flatIndex = flat.indexOf(hit)
                  const Icon = TYPE_ICONS[hit.type]
                  const isActive = flatIndex === activeIndex
                  return (
                    <button
                      key={`${hit.type}-${hit.id}`}
                      id={`global-search-option-${flatIndex}`}
                      data-index={flatIndex}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => go(hit)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors',
                        isActive ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate font-medium">
                            <Highlight text={hit.title} query={trimmed} />
                          </span>
                          {hit.subtitle && (
                            <span className="truncate text-xs text-muted-foreground">
                              <Highlight text={hit.subtitle} query={trimmed} />
                            </span>
                          )}
                        </span>
                        {hit.snippet && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                            <Highlight text={hit.snippet} query={trimmed} />
                          </span>
                        )}
                        {hit.matched_fields && hit.matched_fields.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {hit.matched_fields.map((f) => (
                              <span
                                key={f}
                                className="rounded-sm bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {t(`search.fields.${f}`, f)}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
