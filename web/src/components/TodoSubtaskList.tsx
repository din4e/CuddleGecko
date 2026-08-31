import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, ChevronDown, ChevronRight, Circle, Plus, Timer, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import { formatDueLabel } from '../lib/dueLabel'
import { AddChildInput } from './AddChildInput'
import { subtreeAllDoneFromMap } from '../lib/buildTodoTree'
import { useTodoCollapseStore } from '../stores/todoCollapse'
import type { Todo } from '../types'

/** afterId targets: a sibling id to place after, null for the top of the
 *  sibling group, or 'last' to append at the end (the backend resolves it —
 *  same contract as the tree view's move). */
export type SubtaskMoveAfterId = number | null | 'last'

/** Where over a row the pointer is releasing. */
type DropZone = 'before' | 'child' | 'after'

export interface TodoSubtaskListProps {
  todo: Todo
  childrenByParent: Map<number, Todo[]>
  onToggle: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  /** Inline quick-add: type + Enter creates the child directly (no dialog).
   *  When wired, every row's "+" opens an inline adder for THAT row — at any
   *  depth; otherwise no add affordance is rendered. */
  onCreateChild?: (parent: Todo, title: string) => void
  /** Delete routes through the page's confirm dialog when provided. */
  onDelete?: (todo: Todo) => void
  onStartPomodoro?: (todo: Todo) => void
  /** The page's one-click "hide completed" toggle: done rows whose whole
   *  loaded subtree is done drop out of render. A done row with open (or
   *  still unloaded) descendants stays — pending work never vanishes with
   *  its parent. Progress chips keep counting the unfiltered map. */
  hideDone?: boolean
  /** Drag & drop reparenting (tree-view semantics, at any depth). When
   *  wired, rows become draggable and act as tri-zone drop targets: upper
   *  band = place before the row, middle = nest as its last child, lower
   *  band = place after it. Not wired → rows are static. */
  onMove?: (id: number, parentId: number | null, afterId: SubtaskMoveAfterId) => void
  /** The subtask id currently being dragged (page-level, so a drag spans
   *  cards and the drawer), or null when none. */
  dragId?: number | null
  onDragIdChange?: (id: number | null) => void
  /** Ancestor ids of this section's todo (its parent chain) — rows refuse a
   *  drop of their own ancestor (cycle). Internal, threaded by recursion. */
  ancestorIds?: Set<number>
}

// Bands mirror the tree rows (30/70) so nesting feels identical everywhere.
function resolveDropZone(e: React.DragEvent): DropZone {
  const rect = e.currentTarget.getBoundingClientRect()
  const rel = (e.clientY - rect.top) / rect.height
  if (rel < 0.3) return 'before'
  if (rel > 0.7) return 'after'
  return 'child'
}

/**
 * TodoSubtaskList renders a todo's subtasks — recursively, at any depth —
 * beneath the parent's card in the flat views (timeline / grouped) and the
 * detail drawer. Every row gets the same feature set regardless of depth:
 * toggle, due label, progress, pomodoro, add-child, delete. Rows with children
 * carry a caret to fold their own branch (shared, persisted fold state).
 */
export default function TodoSubtaskList({ todo, childrenByParent, onToggle, onEdit, onCreateChild, onDelete, onStartPomodoro, hideDone, onMove, dragId, onDragIdChange, ancestorIds }: TodoSubtaskListProps) {
  const { t } = useTranslation()
  const children = childrenByParent.get(todo.id)
  // Id of the todo the inline adder targets (the section's own todo for the
  // trailing "add child" row, or a clicked row's todo). null = hidden.
  const [addingFor, setAddingFor] = useState<number | null>(null)
  const collapsed = useTodoCollapseStore((s) => s.collapsed)
  const toggleCollapse = useTodoCollapseStore((s) => s.toggle)
  const reveal = useTodoCollapseStore((s) => s.reveal)
  // Tri-zone hover for this section's rows (only one row can be hovered at a
  // time, so a single section-level slot replaces per-row state).
  const [hover, setHover] = useState<{ id: number; zone: DropZone } | null>(null)
  const draggable = onMove != null && onDragIdChange != null
  // Dropping into this section (any zone) makes the dragged todo a descendant
  // of `todo` — refuse when the drag comes from todo's own chain (cycle).
  const selfChain = new Set(ancestorIds).add(todo.id)

  // With the inline adder wired, the section is useful even before the first
  // child exists — that's exactly when "add a subtask" is needed most.
  const showAdder = onCreateChild != null
  const rows = hideDone && children
    ? children.filter((c) => c.status !== 'done' || !subtreeAllDoneFromMap(c, childrenByParent))
    : children
  if (!rows?.length && !showAdder) return null

  const rowAdder = addingFor != null && addingFor !== todo.id
    ? rows?.find((c) => c.id === addingFor)
    : undefined

  return (
    <div className="mt-1 space-y-1 border-l-2 border-border pl-2">
      {rows?.map((child, i) => {
        const grandChildren = childrenByParent.get(child.id)
        // The caret/fold follows the VISIBLE rows (a caret that expands to
        // nothing is a bug), but the progress chip keeps the TRUE counts.
        const visibleGrandChildren = hideDone && grandChildren
          ? grandChildren.filter((g) => g.status !== 'done' || !subtreeAllDoneFromMap(g, childrenByParent))
          : grandChildren
        const hasChildren = !!visibleGrandChildren?.length
        const showsProgress = !!grandChildren?.length
        const childFolded = hasChildren && collapsed.has(child.id)
        const prevSiblingId = i > 0 ? rows[i - 1].id : null
        const canDropHere = dragId != null && dragId !== child.id && !selfChain.has(dragId)
        const isDragged = dragId === child.id
        const hovered = hover?.id === child.id ? hover.zone : null
        const commitDrop = (zone: DropZone) => {
          if (dragId == null) return
          if (zone === 'child') {
            // Nest under the row, appended last; unfold it so the drop — and
            // any folded descendants — are actually visible.
            reveal(child.id)
            onMove!(dragId, child.id, 'last')
          } else if (zone === 'before') {
            onMove!(dragId, todo.id, prevSiblingId)
          } else {
            onMove!(dragId, todo.id, child.id)
          }
          setHover(null)
          onDragIdChange?.(null)
        }
        return (
        <div key={child.id}>
          <div
            draggable={draggable}
            // A drag gesture starting on a row must never arm the surrounding
            // card's dnd-kit listeners (it would drag the whole card instead).
            onPointerDown={draggable ? (e) => e.stopPropagation() : undefined}
            onDragStart={draggable ? (e) => {
              e.stopPropagation()
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(child.id))
              onDragIdChange!(child.id)
            } : undefined}
            onDragEnd={() => {
              setHover(null)
              onDragIdChange?.(null)
            }}
            onDragOver={(e) => {
              // Always stop: rows are nested in the card's nest target, and
              // hovering a row (even an invalid one) is not a card drop.
              e.stopPropagation()
              if (!canDropHere) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setHover({ id: child.id, zone: resolveDropZone(e) })
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node) && hover?.id === child.id) setHover(null)
            }}
            onDrop={(e) => {
              e.stopPropagation()
              if (!canDropHere) return
              e.preventDefault()
              commitDrop(hovered ?? resolveDropZone(e))
            }}
            className={cn(
              'group/sub flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/60',
              draggable && 'cursor-grab',
              isDragged && 'opacity-40',
              hovered === 'child' && 'ring-2 ring-primary/70 bg-primary/5',
              hovered === 'before' && 'border-t-2 border-primary',
              hovered === 'after' && 'border-b-2 border-primary',
            )}
          >
            {/* fold caret — same affordance as the tree view, so a deep branch
                can be tucked away at any depth */}
            {hasChildren ? (
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => toggleCollapse(child.id)}
                aria-expanded={!childFolded}
                aria-label={childFolded ? t('todos.expand') : t('todos.collapse')}
              >
                {childFolded ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            ) : (
              <span className="inline-block w-3 shrink-0" />
            )}
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => onToggle(child)}
              aria-label={child.status === 'pending' ? t('todos.markDone') : t('todos.markPending')}
            >
              {child.status === 'done'
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                : child.status === 'abandoned'
                  ? <Ban className="h-3.5 w-3.5" />
                  : <Circle className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className={`min-w-0 flex-1 truncate text-left text-xs ${child.status !== 'pending' ? 'text-muted-foreground line-through' : ''}`}
              onClick={() => onEdit(child)}
              title={child.title}
            >
              {child.title}
            </button>
            {child.due_time && (
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap text-[10px]',
                  child.status === 'pending' && new Date(child.due_time) < new Date()
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {formatDueLabel(child.due_time, new Date(), t)}
              </span>
            )}
            {showsProgress && (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {grandChildren!.filter((c) => c.status === 'done').length}/{grandChildren!.length}
              </span>
            )}
            {onStartPomodoro && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity group-hover/sub:opacity-100"
                onClick={() => onStartPomodoro(child)}
                aria-label={t('todos.pomoStart')}
                title={t('todos.pomoStart')}
              >
                <Timer className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/sub:opacity-100"
                onClick={() => onDelete(child)}
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            {onCreateChild && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 shrink-0 p-0 opacity-0 transition-opacity group-hover/sub:opacity-100"
                onClick={() => setAddingFor(child.id)}
                aria-label={t('todos.addChild')}
                title={t('todos.addChild')}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
          {/* Recurse: grandchildren render indented under their own parent row,
              with the same controls as any other depth — unless folded. */}
          {!childFolded && (
            <div className="pl-4">
              <TodoSubtaskList
                todo={child}
                childrenByParent={childrenByParent}
                onToggle={onToggle}
                onEdit={onEdit}
                onCreateChild={onCreateChild}
                onDelete={onDelete}
                onStartPomodoro={onStartPomodoro}
                hideDone={hideDone}
                onMove={onMove}
                dragId={dragId}
                onDragIdChange={onDragIdChange}
                ancestorIds={selfChain}
              />
            </div>
          )}
          {/* Row-level inline adder: new child of THIS row. */}
          {!childFolded && rowAdder?.id === child.id && (
            <div className="pl-6 py-0.5">
              <AddChildInput
                placeholder={t('todos.addSubtaskPlaceholder')}
                onCommit={(v) => onCreateChild!(child, v)}
                onDismiss={() => setAddingFor(null)}
                className="text-xs"
              />
            </div>
          )}
        </div>
        )
      })}
      {showAdder && (addingFor === todo.id ? (
        <AddChildInput
          placeholder={t('todos.addSubtaskPlaceholder')}
          onCommit={(v) => onCreateChild!(todo, v)}
          onDismiss={() => setAddingFor(null)}
          className="text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingFor(todo.id)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('todos.addChild')}
        </button>
      ))}
    </div>
  )
}

