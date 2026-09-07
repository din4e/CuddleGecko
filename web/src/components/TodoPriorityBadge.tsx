import { useTranslation } from 'react-i18next'
import type { TodoPriority } from '../types'

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
