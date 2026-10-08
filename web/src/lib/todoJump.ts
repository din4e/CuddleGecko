import { createContext, useContext } from 'react'
import { defaultUrlTransform } from 'react-markdown'

/**
 * In-app todo jump. Markdown links of the form `[title](todo:123)` (in a
 * todo's title/description, rendered through InlineMarkdown/Markdown) resolve
 * against this context: when a provider is mounted (the todos page), clicking
 * jumps to that todo's detail drawer; without one the link renders as inert
 * styled text instead of navigating to a bogus URL.
 */
export interface TodoJump {
  openTodo: (id: number) => void
}

export const TodoJumpContext = createContext<TodoJump | null>(null)

export function useTodoJump(): TodoJump | null {
  return useContext(TodoJumpContext)
}

/** Matches the in-app link scheme: `todo:<id>`. */
export const TODO_LINK_RE = /^todo:(\d+)$/

/** react-markdown URL filter: the default allowlist plus the in-app todo:<id>
 *  scheme (defaultUrlTransform strips unknown protocols to ""). */
export function todoLinkUrlTransform(value: string): string {
  if (TODO_LINK_RE.test(value)) return value
  return defaultUrlTransform(value)
}
