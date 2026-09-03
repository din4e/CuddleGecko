import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  rectIntersection,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ban, CheckCircle2, CornerDownRight, Flame, Tag as TagIcon, Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { Todo, Tag } from '../types'
import type { KanbanColumn } from '../api/settings'
import { bucketByColumns, matchesColumn } from '../lib/kanban'
import { cardDropZone } from '../lib/dnd'

/** Horizontal swimlane. Dropping a card into a lane applies the lane's
 *  predicate on top of the column predicate (lane 'high' → priority=high). */
export interface KanbanLane {
  id: string
  kind: 'priority'
  value: string
}

export interface KanbanBoardProps {
  todos: Todo[]
  columns: KanbanColumn[]
  tags: Tag[]
  addColumn: (col: KanbanColumn) => void
  removeColumn: (id: string) => void
  onColumnsReorder: (cols: KanbanColumn[]) => void
  renderCard: (todo: Todo) => ReactNode
  /** Drop onto a column/lane cell: apply the column predicate (and the lane's,
   *  e.g. priority, when swimlanes are on). */
  onCardDropColumn: (todo: Todo, col: KanbanColumn, lane?: KanbanLane) => void
  /** Reorder within a cell; afterId = the todo to place behind, null = first. */
  onReorder: (id: number, afterId: number | null) => void
  /** Drop onto the middle of a card in the SAME cell: make the dragged todo a
   *  child of it. Cross-cell drops keep applying the column predicate. */
  onNest?: (draggedId: number, parentId: number) => void
  /** Quick-create inside a column/lane cell; the page applies the predicates. */
  onCreateInColumn: (title: string, col: KanbanColumn, lane?: KanbanLane) => void
  /** Selected card ids while the page is in selection mode — dragging a
   *  selected card drags the whole selection (batch apply). */
  selectedIds?: Set<number>
}

type SwimlaneMode = 'none' | 'priority'

const DEFAULT_COL_WIDTH = 256
const MIN_COL_WIDTH = 180
const MAX_COL_WIDTH = 480
const WIDTHS_KEY = 'kanbanColWidths'
const SWIMLANE_KEY = 'kanbanSwimlaneMode'
// Layout constants mirrored from the Tailwind classes below so divider strips
// can be positioned arithmetically: COL_GAP = gap-1.5, LANE_SPACER_W = w-20.
const COL_GAP = 6
const LANE_SPACER_W = 80
const RESIZER_STRIP_W = 12

// Drag ids are namespaced so handlers can tell draggables apart:
//   t<todoId>            sortable card
//   colsort:<colId>      sortable column header (column reorder)
//   cell:<lane>|<colId>  droppable cell body (lane id is 'all' when off)
const itemId = (todoId: number) => `t${todoId}`
const colSortId = (colId: string) => `colsort:${colId}`
const cellDroppableId = (cellKey: string) => `cell:${cellKey}`
const cellKeyOf = (laneId: string, colId: string) => `${laneId}|${colId}`
const parseCellKey = (key: string): [string, string] => {
  const i = key.indexOf('|')
  return [key.slice(0, i), key.slice(i + 1)]
}

export default function KanbanBoard({
  todos,
  columns,
  tags,
  addColumn,
  removeColumn,
  onColumnsReorder,
  renderCard,
  onCardDropColumn,
  onReorder,
  onNest,
  onCreateInColumn,
  selectedIds,
}: KanbanBoardProps) {
  const { t } = useTranslation()

  // --- Swimlanes (horizontal grouping by a second dimension) ---
  const [laneMode, setLaneMode] = useState<SwimlaneMode>(() =>
    localStorage.getItem(SWIMLANE_KEY) === 'priority' ? 'priority' : 'none',
  )
  useEffect(() => {
    localStorage.setItem(SWIMLANE_KEY, laneMode)
  }, [laneMode])
  const laneDefs = useMemo(
    () => (laneMode === 'none' ? [{ id: 'all' }] : [{ id: 'high' }, { id: 'normal' }, { id: 'low' }, { id: 'none' }]),
    [laneMode],
  )
  const laneMatches = useCallback(
    (todo: Todo, laneId: string) => laneMode === 'none' || todo.priority === laneId,
    [laneMode],
  )
  const laneOf = (laneId: string): KanbanLane | undefined =>
    laneMode === 'none' ? undefined : { id: laneId, kind: 'priority', value: laneId }
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set())
  const toggleLane = (laneId: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev)
      if (next.has(laneId)) next.delete(laneId)
      else next.add(laneId)
      return next
    })
  }

  // --- Derived buckets: column × lane cells + per-lane unmatched overflow ---
  const filteredTodos = useMemo(
    () => todos.filter((td) => td.status === 'pending' || td.status === 'done' || td.status === 'abandoned'),
    [todos],
  )
  const derived = useMemo(() => {
    const { byColumn, unmatched } = bucketByColumns(filteredTodos, columns)
    const cells: Record<string, number[]> = {}
    const unmatchedByLane: Record<string, number[]> = {}
    for (const lane of laneDefs) {
      for (const col of columns) {
        cells[cellKeyOf(lane.id, col.id)] = (byColumn.get(col.id) ?? [])
          .filter((td) => laneMatches(td, lane.id))
          .map((td) => td.id)
      }
      unmatchedByLane[lane.id] = unmatched.filter((td) => laneMatches(td, lane.id)).map((td) => td.id)
    }
    return { byColumn, cells, unmatchedByLane, hasUnmatched: unmatched.length > 0 }
  }, [filteredTodos, columns, laneDefs, laneMatches])
  const todoById = useMemo(() => new Map(todos.map((td) => [td.id, td])), [todos])

  // Local cell state drives the drag preview (cards move across cells before
  // the server mutation lands). Re-synced whenever the derived board changes,
  // but never mid-drag so an in-flight refetch can't clobber the preview.
  const [cells, setCells] = useState<Record<string, number[]>>(() => ({ ...derived.cells }))
  const dragging = useRef(false)
  useEffect(() => {
    if (dragging.current) return
    setCells({ ...derived.cells })
  }, [derived])

  // --- Column widths (resizable via the header divider) ---
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}')
    } catch {
      return {}
    }
  })
  const widthOf = (colId: string) => colWidths[colId] ?? DEFAULT_COL_WIDTH
  const startResize = (colId: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widthOf(colId)
    // Window-level listeners keep the drag alive even when the pointer
    // outruns the 12px strip (no pointer capture needed).
    const move = (ev: PointerEvent) => {
      const w = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX))
      setColWidths((prev) => (prev[colId] === w ? prev : { ...prev, [colId]: w }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setColWidths((prev) => {
        localStorage.setItem(WIDTHS_KEY, JSON.stringify(prev))
        return prev
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Divider strips sit over the gap after every column, spanning the whole
  // board height (header + all lanes). Positions are computed from the same
  // width numbers the columns render with, so they track the drag live.
  const dividers = useMemo(() => {
    const spacer = laneMode !== 'none' ? LANE_SPACER_W : 0
    const w = (id: string) => colWidths[id] ?? DEFAULT_COL_WIDTH
    return columns.map((col, i) => {
      const rightEdge = columns.slice(0, i + 1).reduce((sum, c) => sum + w(c.id) + COL_GAP, spacer)
      return { colId: col.id, left: rightEdge - COL_GAP / 2 - RESIZER_STRIP_W / 2 }
    })
  }, [columns, colWidths, laneMode])

  // --- Canvas pan: grab empty board space and drag to scroll horizontally ---
  const scrollRef = useRef<HTMLDivElement>(null)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ x: number; left: number } | null>(null)
  const onPanPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (el.closest('[data-kanban-card],[data-kanban-colhead],[data-kanban-resizer],button,input,textarea,select,a,[role=button]')) return
    const c = scrollRef.current
    if (!c) return
    pan.current = { x: e.clientX, left: c.scrollLeft }
    setPanning(true)
    c.setPointerCapture(e.pointerId)
  }
  const onPanPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return
    const c = scrollRef.current
    if (!c) return
    c.scrollLeft = pan.current.left - (e.clientX - pan.current.x)
  }
  const endPan = () => {
    pan.current = null
    setPanning(false)
  }

  // --- DnD ---
  const [active, setActive] = useState<{ type: 'card' | 'column'; id: number | string } | null>(null)
  // Card hovered in its middle zone within the same cell — rendered with a
  // nest affordance so the user sees the drop creates a parent-child link.
  const [nestTarget, setNestTarget] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // Column drags only collide with other column headers; card drags use the
  // default closest-corners over cards + cell bodies.
  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === 'column') {
      return rectIntersection(args).filter((c) => String(c.id).startsWith('colsort:'))
    }
    return closestCorners(args)
  }

  const findCellOfCard = (cardId: string): string | null => {
    const id = Number(cardId.slice(1))
    for (const [key, ids] of Object.entries(cells)) {
      if (ids.includes(id)) return key
    }
    return null
  }
  const overCell = (over: { id: string | number; data?: { current?: Record<string, unknown> } } | null): string | null => {
    if (!over) return null
    const containerId = (over.data?.current?.sortable as { containerId?: string } | undefined)?.containerId
    if (containerId) return containerId
    const s = String(over.id)
    return s.startsWith('cell:') ? s.slice(5) : null
  }

  // Batch drag: dragging a selected card while in selection mode carries the
  // whole selection across.
  const batchIds = useMemo(() => {
    if (!active || active.type !== 'card' || !selectedIds || selectedIds.size === 0) return []
    const dragId = Number(String(active.id).slice(1))
    if (!selectedIds.has(dragId)) return []
    return filteredTodos.filter((td) => selectedIds.has(td.id)).map((td) => td.id)
  }, [active, selectedIds, filteredTodos])

  const handleDragStart = (e: DragStartEvent) => {
    dragging.current = true
    const type = (e.active.data.current?.type as 'card' | 'column') ?? 'card'
    setActive({ type, id: type === 'card' ? Number(String(e.active.id).slice(1)) : String(e.active.id) })
  }

  // Live preview: while dragging over another cell, move the card into that
  // cell's local list so the placeholder renders there. Hovering the MIDDLE of
  // a card in the same cell instead marks it as a nest target (drop = child).
  const handleDragOver = (e: DragOverEvent) => {
    const { active: a, over } = e
    if (!over || a.data.current?.type === 'column') return
    const from = findCellOfCard(String(a.id))
    const to = overCell(over)
    if (!from || !to) return
    if (from === to) {
      const overStr = String(over.id)
      const overCardId = overStr.startsWith('cell:') ? null : Number(overStr.slice(1))
      const draggedId = Number(String(a.id).slice(1))
      if (overCardId != null && overCardId !== draggedId && onNest &&
          cardDropZone(a.rect.current.translated, over.rect) === 'middle') {
        setNestTarget(overCardId)
      } else {
        setNestTarget(null)
      }
      return
    }
    setNestTarget(null)
    setCells((prev) => {
      const fromIds = prev[from] ?? []
      const toIds = prev[to] ?? []
      const id = Number(String(a.id).slice(1))
      if (!fromIds.includes(id)) return prev
      let insertAt = toIds.length
      const s = String(over.id)
      if (!s.startsWith('cell:')) {
        const overIdx = toIds.indexOf(Number(s.slice(1)))
        if (overIdx >= 0) insertAt = overIdx
      }
      return {
        ...prev,
        [from]: fromIds.filter((it) => it !== id),
        [to]: [...toIds.slice(0, insertAt), id, ...toIds.slice(insertAt)],
      }
    })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    dragging.current = false
    setActive(null)
    setNestTarget(null)
    const { active: a, over } = e

    // Column reorder: swap the column order and persist it.
    if (a.data.current?.type === 'column') {
      const overId = String(over?.id ?? '')
      if (!overId.startsWith('colsort:')) return
      const from = columns.findIndex((c) => colSortId(c.id) === String(a.id))
      const to = columns.findIndex((c) => colSortId(c.id) === overId)
      if (from < 0 || to < 0 || from === to) return
      onColumnsReorder(arrayMove(columns, from, to))
      return
    }

    const id = Number(String(a.id).slice(1))
    const todo = todoById.get(id)
    if (!todo) return
    const to = overCell(over)
    if (!to || !over) return
    const [laneId, colId] = parseCellKey(to)
    const col = columns.find((c) => c.id === colId)
    if (!col) return

    const laneChanged = laneMode !== 'none' && todo.priority !== laneId
    const colChanged = !matchesColumn(todo, col)
    if (laneChanged || colChanged) {
      const lane = laneOf(laneId)
      // Batch: apply predicates for every selected card.
      if (batchIds.length > 1) {
        for (const tid of batchIds) {
          const td = todoById.get(tid)
          if (!td) continue
          const lc = laneMode !== 'none' && td.priority !== laneId
          const cc = !matchesColumn(td, col)
          if (lc || cc) onCardDropColumn(td, col, lane)
        }
      } else {
        onCardDropColumn(todo, col, lane)
      }
      return
    }

    // Same cell + middle of a card: nest the dragged card under it (batch
    // drops nest every selected card). Takes precedence over reordering.
    {
      const overStr = String(over.id)
      const overCardId = overStr.startsWith('cell:') ? null : Number(overStr.slice(1))
      if (overCardId != null && overCardId !== id && onNest &&
          cardDropZone(a.rect.current.translated, over.rect) === 'middle') {
        if (batchIds.length > 1) {
          for (const tid of batchIds) {
            if (tid !== overCardId) onNest(tid, overCardId)
          }
        } else {
          onNest(id, overCardId)
        }
        return
      }
    }

    // Same cell: commit the local order via the reorder API (after_id).
    // dnd-kit reports the card being dropped onto; translate that into the
    // todo to place behind. Batch drops don't reorder.
    if (batchIds.length > 1) return
    const ids = cells[to] ?? []
    const idx = ids.indexOf(id)
    const overStr = String(over.id)
    const overTodoId = overStr.startsWith('cell:') ? null : Number(overStr.slice(1))
    const overIdx = overTodoId == null ? -1 : ids.indexOf(overTodoId)
    if (overIdx < 0 || overIdx === idx) return
    if (overIdx < idx) {
      onReorder(id, overTodoId)
    } else if (ids[overIdx - 1] !== id) {
      onReorder(id, ids[overIdx - 1])
    }
  }

  const handleDragCancel = () => {
    dragging.current = false
    setActive(null)
    setNestTarget(null)
    setCells({ ...derived.cells })
  }

  // --- Add-column form ---
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [newColLabel, setNewColLabel] = useState('')
  const [newColKind, setNewColKind] = useState<'status' | 'priority' | 'tag'>('status')
  const [newColValue, setNewColValue] = useState('pending')
  const submitNewColumn = () => {
    const label = newColLabel.trim()
    if (!label || !newColValue) return
    addColumn({ id: `${newColKind}-${newColValue}-${Date.now()}`, label, kind: newColKind, value: newColValue })
    setNewColLabel('')
    setAddColumnOpen(false)
  }

  const activeTodo = active?.type === 'card' ? todoById.get(active.id as number) : undefined
  const activeCol = active?.type === 'column' ? columns.find((c) => colSortId(c.id) === active.id) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="space-y-2">
      {/* Toolbar: swimlane mode */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('todos.kanbanSwimlanes')}</span>
        <Select value={laneMode} onValueChange={(v) => setLaneMode(v as SwimlaneMode)}>
          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('todos.kanbanSwimlaneNone')}</SelectItem>
            <SelectItem value="priority">{t('todos.kanbanSwimlanePriority')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        ref={scrollRef}
        data-kanban-bg
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        className={`overflow-x-auto pb-2 h-[calc(100vh-19rem)] ${panning ? 'cursor-grabbing select-none' : ''}`}
      >
        {/* flex-col + h-full: header keeps its natural height, lane rows
            stretch to fill the viewport, so cells (and the divider strips
            overlaying them) run all the way down instead of ending where the
            shortest card list does. */}
        <div className="min-w-max relative flex flex-col h-full">
          {/* Draggable column dividers — full-height strips over each gap.
              pointer-events-none on the layer, auto on the strips, so cards
              and pan-to-scroll underneath keep working. */}
          <div className="absolute inset-0 pointer-events-none">
            {dividers.map(({ colId, left }) => (
              <div
                key={colId}
                data-kanban-resizer
                role="separator"
                aria-orientation="vertical"
                aria-label={t('todos.kanbanResizeColumn')}
                title={t('todos.kanbanResizeColumn')}
                onPointerDown={startResize(colId)}
                style={{ left, width: RESIZER_STRIP_W }}
                className="group/resizer pointer-events-auto absolute top-0 bottom-0 z-10 flex touch-none cursor-col-resize justify-center"
              >
                <div className="w-0.5 h-full rounded bg-transparent transition-colors group-hover/resizer:bg-primary/50" />
              </div>
            ))}
          </div>
          {/* Header row: draggable column headers */}
          <SortableContext items={columns.map((c) => colSortId(c.id))} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-1.5 items-center">
              {laneMode !== 'none' && <div className="w-20 shrink-0" />}
              {columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  col={col}
                  width={widthOf(col.id)}
                  count={(derived.byColumn.get(col.id) ?? []).length}
                  onRemove={() => removeColumn(col.id)}
                />
              ))}
              {derived.hasUnmatched && (
                <div style={{ width: 224 }} className="shrink-0">
                  <h3 className="text-sm font-medium mb-1.5 flex items-center gap-2 text-muted-foreground py-1">
                    {t('todos.kanbanOther')}
                  </h3>
                </div>
              )}
              <div style={{ width: 176 }} className="shrink-0">
                {addColumnOpen ? (
                  <div className="rounded-lg border p-2 space-y-2 bg-background">
                    <Input
                      autoFocus
                      placeholder={t('todos.kanbanColumnLabel')}
                      value={newColLabel}
                      onChange={(e) => setNewColLabel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitNewColumn()}
                      className="h-7 text-sm"
                    />
                    <Select value={newColKind} onValueChange={(v) => { setNewColKind(v as typeof newColKind); setNewColValue(v === 'status' ? 'pending' : v === 'priority' ? 'high' : String(tags[0]?.id ?? '')) }}>
                      <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="status">{t('todos.kanbanKindStatus')}</SelectItem>
                        <SelectItem value="priority">{t('todos.kanbanKindPriority')}</SelectItem>
                        <SelectItem value="tag">{t('todos.kanbanKindTag')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={newColValue} onValueChange={(v) => v && setNewColValue(v)}>
                      <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {newColKind === 'status' && <>
                          <SelectItem value="pending">{t('todos.pending')}</SelectItem>
                          <SelectItem value="done">{t('todos.done')}</SelectItem>
                          <SelectItem value="abandoned">{t('todos.abandoned')}</SelectItem>
                        </>}
                        {newColKind === 'priority' && <>
                          <SelectItem value="high">{t('todos.high')}</SelectItem>
                          <SelectItem value="normal">{t('todos.normal')}</SelectItem>
                          <SelectItem value="low">{t('todos.low')}</SelectItem>
                          <SelectItem value="none">{t('todos.none')}</SelectItem>
                        </>}
                        {newColKind === 'tag' && tags.map((tg) => (
                          <SelectItem key={tg.id} value={String(tg.id)}>{tg.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs" disabled={!newColLabel.trim() || !newColValue} onClick={submitNewColumn}>{t('common.confirm')}</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddColumnOpen(false)}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddColumnOpen(true)}
                    className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    {t('todos.kanbanAddColumn')}
                  </button>
                )}
              </div>
            </div>
          </SortableContext>

          {/* Lane rows */}
          {laneDefs.map((lane) => {
            const laneTodoIds = [
              ...columns.flatMap((col) => cells[cellKeyOf(lane.id, col.id)] ?? []),
              ...(derived.unmatchedByLane[lane.id] ?? []),
            ]
            const collapsed = collapsedLanes.has(lane.id)
            return (
              // Stretched lanes share the board height (cells + dividers reach
              // the bottom); a collapsed lane keeps its natural label height.
              <div key={lane.id} className={`flex gap-1.5 mt-1.5 ${collapsed ? 'items-start' : 'items-stretch flex-1 min-h-0'}`}>
                {laneMode !== 'none' && (
                  <div className="w-20 shrink-0 flex items-center gap-1 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleLane(lane.id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t('todos.kanbanToggleLane')}
                    >
                      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(`todos.${lane.id}`)}
                      <span className="ml-1 opacity-70">{laneTodoIds.length}</span>
                    </span>
                  </div>
                )}
                {!collapsed && columns.map((col) => (
                  <BoardCell
                    key={col.id}
                    cellKey={cellKeyOf(lane.id, col.id)}
                    width={widthOf(col.id)}
                    itemIds={(cells[cellKeyOf(lane.id, col.id)] ?? []).map(itemId)}
                    showEmpty={laneMode === 'none'}
                    renderCard={renderCard}
                    todoById={todoById}
                    nestTarget={nestTarget}
                    onCreate={(title) => onCreateInColumn(title, col, laneOf(lane.id))}
                  />
                ))}
                {!collapsed && derived.hasUnmatched && (
                  <div style={{ width: 224 }} className="shrink-0">
                    <div className="h-full min-h-[60px] bg-muted/20 rounded-lg p-2 border-2 border-dashed space-y-1.5">
                      {(derived.unmatchedByLane[lane.id] ?? []).map((tid) => {
                        const td = todoById.get(tid)
                        return td ? <div key={tid} className="opacity-80">{renderCard(td)}</div> : null
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {active?.type === 'card' && batchIds.length > 1 ? (
          <div className="w-64 space-y-1 rotate-2 scale-[0.97] shadow-lg">
            {batchIds.slice(0, 3).map((tid) => {
              const td = todoById.get(tid)
              return td ? (
                <div key={tid} className="opacity-90 shadow-lg rounded-md bg-background">
                  {renderCard(td)}
                </div>
              ) : null
            })}
            {batchIds.length > 3 && (
              <div className="text-xs text-muted-foreground px-2 py-1 bg-background rounded-md shadow-lg">
                +{batchIds.length - 3}
              </div>
            )}
          </div>
        ) : active?.type === 'card' && activeTodo ? (
          <div className="rotate-2 scale-[0.97] shadow-lg opacity-90 w-64 cursor-grabbing">{renderCard(activeTodo)}</div>
        ) : active?.type === 'column' && activeCol ? (
          <div className="w-64 rounded-lg border bg-background shadow-xl p-2 text-sm font-medium flex items-center gap-2">
            <ColumnIcon col={activeCol} />
            <span className="truncate">{activeCol.label}</span>
            <span className="text-xs rounded-full bg-muted px-1.5 py-0.5">
              {(derived.byColumn.get(activeCol.id) ?? []).length}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  )
}

function ColumnIcon({ col }: { col: KanbanColumn }) {
  if (col.kind === 'status' && col.value === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (col.kind === 'status' && col.value === 'abandoned') return <Ban className="h-4 w-4 text-muted-foreground" />
  if (col.kind === 'priority') return <Flame className="h-4 w-4 text-orange-500" />
  return <TagIcon className="h-4 w-4 text-blue-500" />
}

/** Sortable column header. Column width is controlled by the full-height
 *  divider strips rendered in the board overlay. */
function ColumnHeader({
  col,
  width,
  count,
  onRemove,
}: {
  col: KanbanColumn
  width: number
  count: number
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colSortId(col.id),
    data: { type: 'column' },
  })
  return (
    <div
      ref={setNodeRef}
      data-kanban-col={col.id}
      style={{ width, transform: CSS.Translate.toString(transform), transition }}
      className={`shrink-0 relative ${isDragging ? 'opacity-30' : ''}`}
    >
      <h3
        data-kanban-colhead
        {...attributes}
        {...listeners}
        className="group/col text-sm font-medium mb-1.5 flex items-center gap-2 py-1 touch-none cursor-grab"
      >
        <ColumnIcon col={col} />
        <span className="truncate">{col.label}</span>
        <span className="text-xs rounded-full bg-muted px-1.5 py-0.5">{count}</span>
        <button
          type="button"
          className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/col:opacity-100"
          onClick={onRemove}
          aria-label={t('todos.kanbanRemoveColumn')}
          title={t('todos.kanbanRemoveColumn')}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </h3>
    </div>
  )
}

/** One column × lane cell: droppable body + vertical sortable cards + quick-add. */
function BoardCell({
  cellKey,
  width,
  itemIds,
  showEmpty,
  renderCard,
  todoById,
  nestTarget,
  onCreate,
}: {
  cellKey: string
  width: number
  itemIds: string[]
  showEmpty: boolean
  renderCard: (todo: Todo) => ReactNode
  todoById: Map<number, Todo>
  nestTarget: number | null
  onCreate: (title: string) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: cellDroppableId(cellKey) })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = () => {
    const v = title.trim()
    if (v) onCreate(v)
    setTitle('')
    setAdding(false)
  }

  return (
    <SortableContext id={cellDroppableId(cellKey)} items={itemIds} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        style={{ width }}
        className={`shrink-0 space-y-1 min-h-[100px] max-h-[calc(100vh-19rem)] overflow-y-auto bg-muted/30 rounded-lg p-2 transition-colors ring-2 ${isOver ? 'ring-primary/60 bg-primary/5' : 'ring-transparent'}`}
      >
        {itemIds.length === 0 && showEmpty && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">{t('todos.noTodos')}</p>
        )}
        {itemIds.map((sid) => (
          <SortableCard
            key={sid}
            todoId={Number(sid.slice(1))}
            todoById={todoById}
            renderCard={renderCard}
            nest={nestTarget === Number(sid.slice(1))}
          />
        ))}
        {adding ? (
          <Input
            autoFocus
            placeholder={t('todos.kanbanNewCardTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setTitle(''); setAdding(false) }
            }}
            className="h-8 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('todos.kanbanAddCard')}
          </button>
        )}
      </div>
    </SortableContext>
  )
}

function SortableCard({
  todoId,
  todoById,
  renderCard,
  nest,
}: {
  todoId: number
  todoById: Map<number, Todo>
  renderCard: (todo: Todo) => ReactNode
  nest?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId(todoId),
    data: { type: 'card' },
  })
  const todo = todoById.get(todoId)
  if (!todo) return null
  return (
    <div
      ref={setNodeRef}
      data-kanban-card
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`relative rounded-md cursor-grab touch-none ${nest ? 'ring-2 ring-primary ring-offset-1' : ''} ${isDragging ? 'opacity-30' : 'hover:shadow-sm'}`}
    >
      {nest && (
        <span className="absolute -top-2 left-2 z-10 flex items-center rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground" aria-hidden>
          <CornerDownRight className="h-3 w-3" />
        </span>
      )}
      {renderCard(todo)}
    </div>
  )
}
