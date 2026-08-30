import { useState } from 'react'
import { cn } from '../lib/utils'

interface AddChildInputProps {
  placeholder: string
  onCommit: (title: string) => void
  onDismiss: () => void
  /** Size tweak for the host surface (tree rows type text-sm, cards text-xs). */
  className?: string
}

/**
 * The one inline quick-add input for creating subtasks (child todos).
 * Shared by the tree rows ("+") and the flat-view/drawer subtask sections so
 * every surface gets identical behavior:
 *   Enter   → commit the trimmed title, clear the draft, stay focused for the
 *             next entry (rapid multi-add, TickTick-style)
 *   Escape  → dismiss
 *   Blur    → dismiss when the draft is empty
 */
export function AddChildInput({ placeholder, onCommit, onDismiss, className }: AddChildInputProps) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim()
    if (v) {
      onCommit(v)
      setDraft('')
    }
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') onDismiss()
      }}
      onBlur={() => { if (!draft.trim()) onDismiss() }}
      maxLength={200}
      className={cn('w-full min-w-0 rounded-sm bg-transparent px-1 py-0.5 outline-none ring-1 ring-primary', className)}
    />
  )
}
