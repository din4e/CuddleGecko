import type { ReactNode } from 'react'
import { useTodoJump } from '../lib/todoJump'

/** Anchor rendering a `[text](todo:<id>)` markdown link. With a jump context
 *  mounted (the todos page) it jumps in-app; without one it degrades to
 *  styled text — never a navigation to a nonexistent URL. */
export function TodoJumpAnchor({ id, children }: { id: string; children: ReactNode }) {
  const jump = useTodoJump()
  if (!jump) return <span className="text-primary underline underline-offset-2">{children}</span>
  return (
    <a
      href={`#todo-${id}`}
      className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
      // Stop propagation: hosts overload click/dblclick (title click opens the
      // drawer, double-click renames) and a link click should only jump.
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        jump.openTodo(id)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  )
}
