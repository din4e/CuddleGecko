import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, ArrowRight, Ban, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  Circle, ListTodo, ListTree, Loader2, Pencil, Plus, Star, Timer, Trash2,
} from 'lucide-react'
import type { Todo } from '../types'
import type { TodoNode } from '../lib/buildTodoTree'
import { subtreeProgressFromNode } from '../lib/todoProgress'
import { cn } from '@/lib/utils'
import { formatDueLabel } from '../lib/dueLabel'
import { TodoChecklist } from './TodoChecklist'

/** afterId targets: a sibling id to place after, null for the top of the
 *  sibling group, or 'last' to append at the end (the backend resolves it, so
 *  the client doesn't need the current last child id — collapsed or partially
 *  loaded parents would otherwise nest at the wrong position). */
export type MoveAfterId = number | null | 'last'

export interface TodoTreeHandlers {
  expanded: Set<number>
  onToggleExpand: (id: number) => void
  onToggle: (id: number) => void
  onRename: (id: number, title: string) => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onMove: (id: number, parentId: number | null, afterId: MoveAfterId) => void
  onAddChild: (todo: Todo) => void
  /** When provided, the row's "+" becomes an inline quick-add (type + Enter
   *  creates the child directly — no dialog). Falls back to onAddChild. */
  onCreateChild?: (todo: Todo, title: string) => void
  onStartPomodoro?: (todo: Todo) => void
  onTogglePin?: (todo: Todo) => void
  formatDate: (d: string | null) => string
  selectable?: boolean
  selectedIds?: Set<number>
  onSelectToggle?: (id: number) => void
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
 *  can compute indent/outdent/up/down move targets. */
export default function TodoTree({
  nodes,
  ...handlers
}: { nodes: TodoNode[] } & TodoTreeHandlers) {
  return (
    <>
      {nodes.map((node, i) => (
        <TreeRow
          key={node.todo.id}
          node={node}
          siblings={nodes}
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
// long as the shared props (handlers, formatDate, expanded/selectedIds Sets,
// the tree nodes) keep stable identity — TodosPage wraps those in useCallback /
// useMemo / state. Data-changing props (expanded, selectedIds, nodes) still
// re-render rows, which is correct.
const TreeRow = memo(function TreeRow(props: RowProps) {
  const { node, siblings, index, parentId, grandparentId, depth, ancestorIds } = props
  const {
    expanded, onToggleExpand, onToggle, onRename, onEdit, onDelete, onMove, onAddChild, onCreateChild, formatDate,
    selectable, selectedIds, onSelectToggle, onStartPomodoro, onTogglePin,
    dragId, onDragIdChange, onLoadChildren,
  } = props
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const todo = node.todo
  // Lazy tree: the server-reported child count keeps the caret visible for
  // collapsed nodes whose children haven't been fetched yet.
  const hasChildren = node.children.length > 0 || (todo.child_count ?? 0) > 0
  const isOpen = expanded.has(todo.id)
  const isDragged = dragId === todo.id
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const [showItems, setShowItems] = useState(false)
  // Single click on the title opens the detail drawer; double-click renames.
  // The delayed click lets a second click cancel it before the drawer opens.
  const titleClickTimer = useRef<number | null>(null)
  const cancelPendingTitleClick = () => {
    if (titleClickTimer.current != null) {
      window.clearTimeout(titleClickTimer.current)
      titleClickTimer.current = null
    }
  }
  useEffect(() => () => {
    if (titleClickTimer.current != null) window.clearTimeout(titleClickTimer.current)
  }, [])
  const startEdit = () => {
    setDraft(todo.title)
    setEditing(true)
  }
  // Inline child quick-add (TickTick-style): "+" reveals an input under the
  // row; Enter creates the child and keeps the input open for the next one.
  const [addingChild, setAddingChild] = useState(false)
  const [childDraft, setChildDraft] = useState('')
  const commitChild = () => {
    const v = childDraft.trim()
    if (v && onCreateChild) {
      onCreateChild(todo, v)
      setChildDraft('')
    }
  }
  const toggleAddChild = () => {
    if (onCreateChild) {
      setChildDraft('')
      setAddingChild((v) => !v)
    } else {
      onAddChild(todo)
    }
  }
  const commit = () => {
    const v = draft.trim()
    if (v && v !== todo.title) onRename(todo.id, v)
    setEditing(false)
  }

  // Outliner keyboard: Tab indents under the previous sibling, Shift+Tab
  // outdents to the grandparent. Prevent the browser's focus walk so the row
  // keeps operating on the same todo.
  const handleRowKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
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

  const dueOverdue = todo.status === 'pending' && todo.due_time && new Date(todo.due_time) < new Date()
  // Cross-subtask roll-up: completion over ALL descendants, not just this
  // todo's own checklist items.
  const subProgress = subtreeProgressFromNode(node)

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
    <div>
      <div
        tabIndex={0}
        onKeyDown={handleRowKey}
        draggable={dragId === undefined ? false : true}
        onDragStart={(e) => {
          if (dragId === undefined || !onDragIdChange) return
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
          'group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isDragged && 'opacity-40',
          dropZone === 'child' && 'ring-2 ring-primary/70 bg-primary/5',
          dropZone === 'before' && 'border-t-2 border-primary',
          dropZone === 'after' && 'border-b-2 border-primary',
        )}
        style={{ paddingLeft: depth * 18 + 4 }}
      >
        {/* selection checkbox (bulk mode) */}
        {selectable && onSelectToggle && (
          <input
            type="checkbox"
            checked={selectedIds?.has(todo.id) ?? false}
            onChange={() => onSelectToggle(todo.id)}
            aria-label={t('todos.select')}
            className="h-3.5 w-3.5"
          />
        )}

        {/* expand / collapse caret */}
        <button
          type="button"
          className="p-0.5 text-muted-foreground disabled:opacity-0"
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

        {/* toggle done */}
        <button type="button" className="p-0.5" onClick={() => onToggle(todo.id)} aria-label={todo.status === 'pending' ? t('todos.markDone') : t('todos.markPending')}>
          {todo.status === 'done' ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : todo.status === 'abandoned' ? (
            <Ban className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* title (double-click to rename) */}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="min-w-0 flex-1 rounded-sm bg-transparent px-1 outline-none ring-1 ring-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              cancelPendingTitleClick()
              titleClickTimer.current = window.setTimeout(() => {
                titleClickTimer.current = null
                onEdit(todo)
              }, 250)
            }}
            onDoubleClick={() => {
              cancelPendingTitleClick()
              startEdit()
            }}
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm',
              todo.status !== 'pending' && 'text-muted-foreground line-through',
            )}
          >
            {todo.title}
          </button>
        )}

        {/* compact meta */}
        {todo.pinned && (
          <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-label={t('todos.pinned')} />
        )}
        {todo.priority === 'high' && todo.status === 'pending' && (
          <span className="text-[10px] font-semibold text-destructive">!{todo.priority[0].toUpperCase()}</span>
        )}
        {todo.due_time && (
          <span className={cn('text-[10px] whitespace-nowrap', dueOverdue ? 'text-destructive' : 'text-muted-foreground')}>
            {formatDueLabel(todo.due_time, new Date(), t)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowItems((v) => !v)}
          aria-label={t('todos.subtasks')}
          aria-expanded={showItems}
          title={t('todos.subtasks')}
          className={cn(
            'flex items-center gap-0.5 rounded px-1 text-[10px] hover:bg-accent',
            showItems ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <ListTodo className="h-3 w-3" />
          {!!todo.item_total && <span>{todo.item_done}/{todo.item_total}</span>}
        </button>
        {subProgress.total > 0 && (
          <span
            className={cn(
              'flex items-center gap-0.5 rounded px-1 text-[10px] tabular-nums',
              subProgress.done === subProgress.total ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
            )}
            title={t('todos.subtaskProgress', { done: subProgress.done, total: subProgress.total })}
          >
            <ListTree className="h-3 w-3" />
            {subProgress.done}/{subProgress.total}
          </span>
        )}
        {onStartPomodoro && (
          <button
            type="button"
            onClick={() => onStartPomodoro(todo)}
            aria-label={t('todos.pomoStart')}
            title={t('todos.pomoStart')}
            className="flex items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground hover:bg-accent"
          >
            <Timer className="h-3 w-3" />
            {!!todo.pomodoro_count && <span className="tabular-nums">{todo.pomodoro_count}</span>}
          </button>
        )}

        {/* hover actions — always visible on touch/small screens, hover-reveal on md+ */}
        <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {onTogglePin && (
            <RowBtn
              onClick={() => onTogglePin(todo)}
              title={t('todos.pinAria')}
              className={todo.pinned ? 'text-amber-500' : undefined}
            >
              <Star className={cn('h-3.5 w-3.5', todo.pinned && 'fill-current')} />
            </RowBtn>
          )}
          <RowBtn onClick={toggleAddChild} title={t('todos.addChild')}>
            <Plus className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn disabled={!canOutdent} onClick={() => onMove(todo.id, grandparentId, parentId)} title={t('todos.outdent')}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn disabled={!canIndent} onClick={() => onMove(todo.id, prevSibling!.todo.id, null)} title={t('todos.indent')}>
            <ArrowRight className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn
            disabled={!canUp}
            onClick={() => onMove(todo.id, parentId, index >= 2 ? siblings[index - 2].todo.id : null)}
            title={t('todos.moveUp')}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn disabled={!canDown} onClick={() => onMove(todo.id, parentId, nextSibling ? nextSibling.todo.id : null)} title={t('todos.moveDown')}>
            <ChevronDown className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn onClick={() => onEdit(todo)} title={t('common.edit')}>
            <Pencil className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn onClick={() => onDelete(todo)} title={t('common.delete')} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </RowBtn>
        </div>
      </div>

      {addingChild && (
        <div style={{ paddingLeft: depth * 18 + 24 }} className="py-0.5">
          <input
            autoFocus
            value={childDraft}
            onChange={(e) => setChildDraft(e.target.value)}
            placeholder={t('todos.addSubtaskPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitChild() }
              if (e.key === 'Escape') { setAddingChild(false); setChildDraft('') }
            }}
            onBlur={() => { if (!childDraft.trim()) setAddingChild(false) }}
            maxLength={200}
            className="w-full min-w-0 rounded-sm bg-transparent px-1 py-0.5 text-sm outline-none ring-1 ring-primary"
          />
        </div>
      )}

      {showItems && (
        <div style={{ paddingLeft: depth * 18 + 24 }} className="py-1">
          <TodoChecklist todoId={todo.id} />
        </div>
      )}

      {isOpen && node.childrenLoading && (
        <div
          style={{ paddingLeft: depth * 18 + 24 }}
          className="flex items-center gap-1 py-0.5 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('todos.loadingChildren')}
        </div>
      )}

      {isOpen && !node.childrenLoading && node.childrenHasMore && onLoadChildren && (
        <div style={{ paddingLeft: depth * 18 + 24 }} className="py-0.5">
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
        node.children.map((child, i) => (
          <TreeRow
            key={child.todo.id}
            node={child}
            siblings={node.children}
            index={i}
            parentId={todo.id}
            grandparentId={parentId}
            depth={depth + 1}
            ancestorIds={new Set(ancestorIds).add(todo.id)}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onToggle={onToggle}
            onRename={onRename}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
            onAddChild={onAddChild}
            onCreateChild={onCreateChild}
            onStartPomodoro={onStartPomodoro}
            onTogglePin={onTogglePin}
            dragId={dragId}
            onDragIdChange={onDragIdChange}
            formatDate={formatDate}
            selectable={selectable}
            selectedIds={selectedIds}
            onSelectToggle={onSelectToggle}
            onLoadChildren={onLoadChildren}
          />
        ))}
    </div>
  )
})

function RowBtn({
  children, onClick, disabled, title, className,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30',
        className,
      )}
    >
      {children}
    </button>
  )
}
