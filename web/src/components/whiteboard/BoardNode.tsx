import { memo } from 'react'
import { Handle, Position, NodeToolbar } from '@xyflow/react'
import { Trash2, UnfoldVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NodeProps } from '@xyflow/react'

// Entity kind → icon glyph shown on the card. Kept inline (no lucide here) so
// the node stays cheap; the glyph doubles as the type badge color.
const KIND_STYLE: Record<string, { glyph: string; cls: string }> = {
  contact: { glyph: '👤', cls: 'border-rose-300 dark:border-rose-700' },
  todo: { glyph: '✅', cls: 'border-sky-300 dark:border-sky-700' },
  event: { glyph: '📅', cls: 'border-violet-300 dark:border-violet-700' },
  workout: { glyph: '💪', cls: 'border-emerald-300 dark:border-emerald-700' },
  transaction: { glyph: '💰', cls: 'border-amber-300 dark:border-amber-700' },
  note: { glyph: '📝', cls: 'border-border' },
}

export interface BoardNodeData extends Record<string, unknown> {
  refType: string
  label: string
  note: string
  color: string
  hasRef: boolean
  onExpand: (nodeId: string) => void
  onDelete: (nodeId: string) => void
}

/** A whiteboard card: entity badge + title (+ note preview). */
export const BoardNode = memo(function BoardNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation()
  const d = data as BoardNodeData
  const kind = KIND_STYLE[d.refType] ?? KIND_STYLE.note
  return (
    <div
      className={`w-52 rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-shadow ${kind.cls} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={d.color ? { borderColor: d.color } : undefined}
    >
      <NodeToolbar className="flex gap-0.5">
        {d.hasRef && (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => d.onExpand(id)}
            title={t('whiteboard.expand')}
            aria-label={t('whiteboard.expand')}
          >
            <UnfoldVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          onClick={() => d.onDelete(id)}
          title={t('whiteboard.deleteNode')}
          aria-label={t('whiteboard.deleteNode')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !bg-muted-foreground/60" />
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-sm leading-5" aria-hidden>{kind.glyph}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{d.label}</p>
          {d.note && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{d.note}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !bg-muted-foreground/60" />
    </div>
  )
})
