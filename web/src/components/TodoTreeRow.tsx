import { memo, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, ChevronUp, Loader2 } from 'lucide-react'
import type { Todo } from '../types'
import type { TodoNode } from '../lib/buildTodoTree'
import { subtreeProgressFromNode, type SubtreeProgress } from '../lib/todoProgress'
import type { TodoCardAction } from './TodoCard'
import { isBarPressActive } from '../lib/barGesture'
import { cn } from '@/lib/utils'

/** afterId targets: a sibling id to place after, null for the top of the
 *  sibling group, or 'last' to append at the end (the backend resolves it, so
 *  the client doesn't need the current last child id — collapsed or partially
 *  loaded parents would otherwise nest at the wrong position). */
export type MoveAfterId = number | null | 'last'

/** Tree-specific context the row injects into its card body: the tree-only
 *  move actions (appended to the card's toolbar) and the subtree progress
 *  computed from the row's own (lazily loaded) children. */
export interface TreeCardExtras {
  extraActions?: TodoCardAction[]
  subtaskProgress?: SubtreeProgress
}

export interface TodoTreeHandlers {
  expanded: Set<number>
  onToggleExpand: (id: number) => void
  onMove: (id: number, parentId: number | null, afterId: MoveAfterId) => void
  /** Renders the row body as the same full card the flat views use. */
  renderCard: (todo: Todo, extras: TreeCardExtras) => ReactNode
  /** Arrow-key navigation target: the row with this id carries the selection
   *  highlight (the page moves it on ↑/↓ and folds around it on ←/→). */
  selectedId?: number | null
  /** Click-to-select: rows report mousedown so the selection tracks clicks. */
  onSelect?: (id: number) => void
  /** Drag & drop reparenting. dragId is the id being dragged (null = none). */
  dragId?: number | null
  dragSubtreeSize?: number
  onDragIdChange?: (id: number | null) => void
  /** Lazy tree: grow this node's children page (useTodoChildrenMap). */
  onLoadChildren?: (id: number) => void
}

/** dropZone describes where over a row the pointer is releasing. */
type DropZone = 'before' | 'child' | 'after'

interface RowProps extends TodoTreeHandlers {
  /** Ancestor todo ids of this row (its parent chain) — used to refuse drops
   *  that would place a node into its own subtree (cycle). */
  ancestorIds: Set<number>
  node: TodoNode
  siblings: TodoNode[]
  index: number
  parentId: number | null
  grandparentId: number | null
  depth: number
}

/** TodoTree renders roots and recurses; each row knows its sibling group so it
 *  can compute indent/outdent/up/down move targets. Rows render the same full
 *  TodoCard the timeline/grouped views use (via renderCard); this component
 *  owns the tree mechanics around it — depth indent, fold caret, tri-zone
 *  drag reparenting and outliner keyboard moves. */
export default function TodoTree({
  nodes,
  ...handlers
}: { nodes: TodoNode[] } & TodoTreeHandlers) {
  // hideDone marks whole-settled (done/abandoned) subtrees hidden; roots
  // arrive prefiltered by the page, this guard just keeps the component
  // correct on its own.
  const visible = nodes.filter((n) => !n.hidden)
  return (
    <>
      {visible.map((node, i) => (
        <TreeRow
          key={node.todo.id}
          node={node}
          siblings={visible}
          index={i}
          parentId={null}
          grandparentId={null}
          ancestorIds={new Set()}
          depth={0}
          {...handlers}
        />
      ))}
    </>
  )
}

// Memoized so an incidental TodosPage re-render (dialog open, search typing,
// selection-mode toggle, …) doesn't re-render every visible row. Effective as
// long as the shared props (handlers, renderCard, expanded/selectedIds Sets,
// the tree nodes) keep stable identity — TodosPage wraps those in useCallback /
// useMemo / state. Data-changing props (expanded, nodes) still re-render rows,
// which is correct.
const TreeRow = memo(function TreeRow(props: RowProps) {
  const { node, siblings, index, parentId, grandparentId, depth, ancestorIds } = props
  const {
    expanded, onToggleExpand, onMove, renderCard, selectedId, onSelect,
    dragId, dragSubtreeSize, onDragIdChange, onLoadChildren,
  } = props
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  // True while a pointer press is held on the row's progress bar: the row's
  // draggable flag drops for the gesture, so the browser never arms a native
  // HTML5 drag that would swallow the bar's pointerup (and its commit).
  const [barGesture, setBarGesture] = useState(false)
  // Safety reset: if the release lands outside the row (lost pointer capture),
  // a window-level capture listener still restores draggability.
  useEffect(() => {
    if (!barGesture) return
    const clear = () => setBarGesture(false)
    window.addEventListener('pointerup', clear, true)
    return () => window.removeEventListener('pointerup', clear, true)
  }, [barGesture])
  const todo = node.todo
  // hideDone: settled (done/abandoned) nodes whose whole loaded subtree is
  // settled are marked hidden (children stay intact — progress and move
  // targets use the real subtree).
  const visibleChildren = node.children.filter((c) => !c.hidden)
  // Lazy tree: the server-reported child count keeps the caret visible for
  // collapsed nodes whose children haven't been fetched yet. Loaded-but-hidden
  // children are discounted so an all-settled subtree leaves no caret that
  // would expand to nothing; unfetched ones still can (they might be pending).
  const hiddenLoaded = node.children.length - visibleChildren.length
  const hasChildren = visibleChildren.length > 0 || (todo.child_count ?? 0) > hiddenLoaded
  const isOpen = expanded.has(todo.id)
  const isDragged = dragId === todo.id
  const isSelected = selectedId === todo.id
  // Dropping onto a descendant of the dragged node would create a cycle —
  // i.e. the dragged id appears in THIS row's ancestor chain.
  const canDropHere =
    dragId != null && dragId !== todo.id && !ancestorIds.has(dragId)
  const prevSiblingId = index > 0 ? siblings[index - 1].todo.id : null

  const prevSibling = index > 0 ? siblings[index - 1] : null
  const nextSibling = index < siblings.length - 1 ? siblings[index + 1] : null
  const canIndent = !!prevSibling
  const canOutdent = parentId != null
  const canUp = index > 0
  const canDown = index < siblings.length - 1

  const { t } = useTranslation()
  // Cross-subtask roll-up over ALL descendants from the row's own subtree —
  // the flat views' children map stays empty in tree mode (children load
  // through the lazy tree instead), so the card chip needs this injection.
  const subProgress = subtreeProgressFromNode(node)
  // Tree-only moves ride in the card's toolbar (and its small-screen kebab
  // menu) next to the standard actions, exactly like every other card.
  const moveActions: TodoCardAction[] = [
    { key: 'outdent', label: t('todos.outdent'), onClick: () => onMove(todo.id, grandparentId, parentId), disabled: !canOutdent, children: <ArrowLeft className="h-3 w-3" /> },
    { key: 'indent', label: t('todos.indent'), onClick: () => onMove(todo.id, prevSibling!.todo.id, null), disabled: !canIndent, children: <ArrowRight className="h-3 w-3" /> },
    { key: 'up', label: t('todos.moveUp'), onClick: () => onMove(todo.id, parentId, index >= 2 ? siblings[index - 2].todo.id : null), disabled: !canUp, children: <ChevronUp className="h-3 w-3" /> },
    { key: 'down', label: t('todos.moveDown'), onClick: () => onMove(todo.id, parentId, nextSibling ? nextSibling.todo.id : null), disabled: !canDown, children: <ChevronDown className="h-3 w-3" /> },
  ]

  // Outliner keyboard: Tab indents under the previous sibling, Shift+Tab
  // outdents to the grandparent. Hijacked only from the row's own navigation
  // surfaces (the row container) — intercepting Tab from the controls inside
  // (card toolbar, rename input) would trap keyboard users in the row, since
  // no Tab press would ever move focus out.
  const handleRowKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    if (
      e.target !== e.currentTarget &&
      (e.target as HTMLElement).closest('button, input, textarea, select')
    ) return
    if (e.shiftKey) {
      if (!canOutdent) return
      e.preventDefault()
      onMove(todo.id, grandparentId, parentId)
    } else {
      if (!canIndent) return
      e.preventDefault()
      onMove(todo.id, prevSibling!.todo.id, null)
    }
  }

  // Tri-zone drop target: top band = previous sibling, middle band = child
  // (reparenting — the whole dragged subtree follows, the backend only
  // rewrites parent_id), bottom band = next sibling. Bands 30/70 mirror the
  // flat views so nesting feels equally easy everywhere.
  const resolveDropZone = (e: React.DragEvent): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientY - rect.top) / rect.height
    if (rel < 0.3) return 'before'
    if (rel > 0.7) return 'after'
    return 'child'
  }

  const commitDrop = () => {
    if (dragId == null || !dropZone) return
    if (dropZone === 'child') {
      // Append as the LAST child of this row — the server resolves "last", so
      // it holds even when this row's children aren't (fully) loaded. Expand a
      // collapsed target so the drop's effect is actually visible.
      if (!isOpen) onToggleExpand(todo.id)
      onMove(dragId, todo.id, 'last')
    } else if (dropZone === 'before') {
      onMove(dragId, parentId, prevSiblingId)
    } else {
      onMove(dragId, parentId, todo.id)
    }
    setDropZone(null)
  }

  return (
    <div className="space-y-1">
      <div
        tabIndex={0}
        data-nav-todo={todo.id}
        onKeyDown={handleRowKey}
        // Clicking anywhere on the row makes it the arrow-key navigation
        // target (card clicks still report through the card's own handler).
        onMouseDown={() => onSelect?.(todo.id)}
        draggable={dragId !== undefined && !barGesture}
        onPointerDownCapture={(e) => {
          // Capture phase: the progress bar stops pointerdown propagation on
          // its way up, so this must see the press BEFORE the bar does to drop
          // the draggable flag for the scrub (see barGesture above).
          setBarGesture(!!(e.target as HTMLElement).closest?.('[role="slider"]'))
        }}
        onPointerUpCapture={() => setBarGesture(false)}
        onDragStart={(e) => {
          if (dragId === undefined || !onDragIdChange) return
          // A gesture that began on the progress scrubber must stay with the
          // bar: letting the row's native drag run would swallow the pointer
          // stream and the percent would never commit.
          if (isBarPressActive()) {
            e.preventDefault()
            return
          }
          e.stopPropagation()
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(todo.id))
          onDragIdChange(todo.id)
        }}
        onDragEnd={() => {
          setDropZone(null)
          onDragIdChange?.(null)
        }}
        onDragOver={(e) => {
          if (!canDropHere) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDropZone(resolveDropZone(e))
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropZone(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          commitDrop()
          onDragIdChange?.(null)
        }}
        className={cn(
          'relative rounded-md',
          isDragged && 'opacity-40',
          isSelected && 'ring-2 ring-ring',
          dropZone === 'child' && 'ring-2 ring-primary/70 bg-primary/5',
          dropZone === 'before' && 'border-t-2 border-primary',
          dropZone === 'after' && 'border-b-2 border-primary',
        )}
        style={{ marginLeft: depth * 18 }}
      >
        <div className="flex items-start gap-1">
          {/* expand / collapse caret */}
          <button
            type="button"
            className="mt-1.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-0"
            disabled={!hasChildren}
            onClick={() => hasChildren && onToggleExpand(todo.id)}
            aria-label={hasChildren ? (isOpen ? t('todos.collapse') : t('todos.expand')) : undefined}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="inline-block w-4" />
            )}
          </button>
          {/* The row body is the same full card the timeline/grouped views
              render — the tree only contributes the mechanics around it. */}
          <div className="min-w-0 flex-1">
            {renderCard(node.todo, { extraActions: moveActions, subtaskProgress: subProgress })}
          </div>
        </div>
      </div>

      {isOpen && node.childrenLoading && (
        <div
          style={{ marginLeft: depth * 18 + 40 }}
          className="flex items-center gap-1 py-0.5 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('todos.loadingChildren')}
        </div>
      )}

      {isOpen && !node.childrenLoading && node.childrenHasMore && onLoadChildren && (
        <div style={{ marginLeft: depth * 18 + 40 }} className="py-0.5">
          <button
            type="button"
            onClick={() => onLoadChildren(todo.id)}
            className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t('todos.loadMoreChildren')}
          </button>
        </div>
      )}

      {isOpen &&
        visibleChildren.map((child, i) => (
          <TreeRow
            key={child.todo.id}
            node={child}
            siblings={visibleChildren}
            index={i}
            parentId={todo.id}
            grandparentId={parentId}
            depth={depth + 1}
            ancestorIds={new Set(ancestorIds).add(todo.id)}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onMove={onMove}
            renderCard={renderCard}
            dragId={dragId}
            dragSubtreeSize={dragSubtreeSize}
            onDragIdChange={onDragIdChange}
            selectedId={selectedId}
            onSelect={onSelect}
            onLoadChildren={onLoadChildren}
          />
        ))}
    </div>
  )
})
