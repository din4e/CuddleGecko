// Ctrl+Z / Cmd+Z anywhere in the app reverts the last recorded operation.
// While typing (inputs, textareas, contentEditable — including xterm's hidden
// textarea) the keystroke stays native text undo instead.
import { useEffect } from 'react'
import { performUndo } from './recorder'

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

export function useUndoHotkey(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if (e.key.toLowerCase() !== 'z') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      void performUndo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
