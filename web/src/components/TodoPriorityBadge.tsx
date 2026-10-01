import { useTranslation } from 'react-i18next'
import type { Todo, TodoPriority } from '../types'

// Priority chip — sits in front of the title on every todo surface.
// Soft-solid colors (readable white text, gentler than full saturation);
// 'none' renders nothing so real priorities stand out.
const styles: Record<TodoPriority, string | undefined> = {
  high: 'bg-red-500/80 text-white',
  normal: 'bg-amber-500/80 text-white',
  low: 'bg-blue-500/80 text-white',
  none: undefined,
}

export default function TodoPriorityBadge({ priority, className = '' }: { priority: TodoPriority; className?: string }) {
  const { t } = useTranslation()
  const cls = styles[priority]
  if (!cls) return null
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-semibold leading-4 shrink-0 ${cls} ${className}`}>
      {t(`todos.${priority}`)}
    </span>
  )
}

// Eisenhower-axis chip (重要度/紧急度). Sits beside the priority badge and
// shows the axis letter plus its tier (重·高 / 急·低); 'none' renders nothing
// so only deliberately classified todos carry chips.
const axisStyles: Record<'importance' | 'urgency', string> = {
  importance: 'bg-violet-500/80 text-white',
  urgency: 'bg-orange-500/80 text-white',
}

export function TodoAxisBadge({ axis, level, className = '' }: { axis: 'importance' | 'urgency'; level: TodoPriority; className?: string }) {
  const { t } = useTranslation()
  if (level === 'none') return null
  return (
    <span className={`inline-flex items-center rounded-md px-1 py-px text-[10px] font-semibold leading-4 shrink-0 ${axisStyles[axis]} ${className}`}>
      {t(`todos.${axis}Short`)}·{t(`todos.${level}`)}
    </span>
  )
}

/** Both axis chips for a todo, in one call site. */
export function TodoAxisBadges({ todo, className = '' }: { todo: Pick<Todo, 'importance' | 'urgency'>; className?: string }) {
  return (
    <>
      <TodoAxisBadge axis="importance" level={todo.importance ?? 'none'} className={className} />
      <TodoAxisBadge axis="urgency" level={todo.urgency ?? 'none'} className={className} />
    </>
  )
}
