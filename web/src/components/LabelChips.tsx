import { cn } from '../lib/utils'
import type { Tag } from '../types'

/** Compact read-only label chips for list rows and cards. */
export default function LabelChips({ tags, className }: { tags?: Tag[]; className?: string }) {
  if (!tags?.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {tags.map((tag) => (
        <span key={tag.id} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/30 py-0.5 pl-1.5 pr-2 text-xs">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color || '#6b7280' }} />
          <span className="min-w-0 truncate">{tag.name}</span>
        </span>
      ))}
    </div>
  )
}
