import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTodosList } from './api/useTodos'
import type { Todo } from '../types'

// "[[" task autocomplete for the todo form's title/description fields: typing
// `[[查询` opens a suggestion popover (loaded todos filter instantly, the
// whole workspace joins once the debounced query lands); picking an entry
// replaces the `[[查询` fragment with a standard markdown link
// `[标题](todo:<id>)` that InlineMarkdown/Markdown render as an in-app jump.
// The link lives in the text itself — no separate field, no side data.

/** Matches an unclosed `[[fragment` ending at the caret (one line, no nesting). */
const MENTION_RE = /\[\[([^\]\n[]*)$/

/** Escapes markdown link-text metacharacters so a bracketed title round-trips. */
function escapeLinkText(title: string): string {
  return title.replace(/([[\\])/g, '\\$1')
}

export interface UseTodoLinkMentionOptions {
  /** Loaded todos offered instantly, before any server search kicks in. */
  candidates: Todo[]
  /** Applies the post-insert field value and caret position (React state + refocus). */
  onApply: (newValue: string, caret: number) => void
}

export function useTodoLinkMention({ candidates, onApply }: UseTodoLinkMentionOptions) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  // The input the `[[` was typed in, and the offset its opening bracket sits at.
  const sourceRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const startRef = useRef(0)

  // Debounce the typed query — one request per pause, not per keystroke.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(handle)
  }, [query, open])

  const { data: results, isFetching } = useTodosList(
    { q: debounced || undefined, page_size: 20 },
    { enabled: open && debounced.length > 0 },
  )

  // Local candidates filter instantly; server results (whole workspace) merge
  // in once the debounced query lands.
  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: Todo[] = []
    const add = (todo: Todo) => {
      if (!seen.has(todo.id)) {
        seen.add(todo.id)
        out.push(todo)
      }
    }
    const needle = query.trim().toLowerCase()
    for (const todo of candidates) {
      if (!needle || todo.title.toLowerCase().includes(needle)) add(todo)
    }
    if (debounced) {
      for (const todo of results?.items ?? []) add(todo)
    }
    return out.slice(0, 8)
  }, [candidates, query, debounced, results])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHighlight(0)
  }, [])

  /** Spread into the field's onChange (alongside the form's own state setter). */
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.target
    sourceRef.current = el
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length)
    const m = MENTION_RE.exec(upto)
    if (m) {
      startRef.current = m.index
      setQuery(m[1])
      setOpen(true)
    } else {
      close()
    }
  }, [close])

  /** Replaces the `[[fragment` with the markdown link and closes. */
  const insert = useCallback((todo: Todo) => {
    const el = sourceRef.current
    if (!el) {
      close()
      return
    }
    const caret = el.selectionStart ?? el.value.length
    const text = `[${escapeLinkText(todo.title)}](todo:${todo.id})`
    const newValue = el.value.slice(0, startRef.current) + text + el.value.slice(caret)
    const newCaret = startRef.current + text.length
    onApply(newValue, newCaret)
    // React re-renders the controlled field with the new value before the
    // frame paints; reposition the caret right after so typing continues
    // where the link ended. Guarded on the field still holding focus — if the
    // user already moved on (Tab, clicked elsewhere), a pending frame must
    // never steal focus back mid-typing.
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return
      el.setSelectionRange(newCaret, newCaret)
    })
    close()
  }, [onApply, close])

  /**
   * Spread into the field's onKeyDown BEFORE its own handler: while the
   * popover is open, ↑/↓/Enter/Tab drive it (preventDefault) and Escape closes
   * it without bubbling (a dialog host would otherwise close too). Returns
   * with nothing prevented when closed → the host's keys behave as usual.
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (items.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => {
        const cur = Math.min(h, items.length - 1)
        return e.key === 'ArrowDown' ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length
      })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insert(items[Math.min(highlight, items.length - 1)])
    }
  }, [open, items, highlight, insert, close])

  return {
    open,
    items,
    highlight,
    isFetching: isFetching && debounced.length > 0,
    sourceRef,
    handleChange,
    handleKeyDown,
    insert,
    setHighlight,
    close,
  }
}
