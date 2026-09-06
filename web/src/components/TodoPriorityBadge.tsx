import { useTranslation } from 'react-i18next'
import type { TodoPriority } from '../types'

// Solid, high-contrast priority chip — importance must be recognizable at a
// glance on cards, tree rows, kanban, the detail drawer and the calendar.
// 'none' renders nothing so real priorities stand out.
const styles: Record<TodoPriority, string | undefined> = {
  high: 'bg-red-500/90 text-white',
  normal: 'bg-amber-500/90 text-white',
  low: 'bg-blue-500/90 text-white',
  none: undefined,
}

export default function TodoPriorityBadge({ priority, className = '' }: { priority: TodoPriority; className?: string }) {
  const { t } = useTranslation()
  const cls = styles[priority]
  if (!cls) return null
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold leading-4 shrink-0 ${cls} ${className}`}>
      {t(`todos.${priority}`)}
    </span>
  )
}
