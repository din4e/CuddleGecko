import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CornerDownRight } from 'lucide-react'
import { cardDropZone } from '../lib/dnd'
import type { Todo } from '../types'

export interface SortableTodoGroup {
  key: string
  label?: ReactNode
  items: Todo[]
}

export interface TodoSortableGroupsProps {
  groups: SortableTodoGroup[]
  renderCard: (todo: Todo) => ReactNode
  /** Renderer for the floating drag preview. Cards carrying big inline
   *  subtask lists should render a light variant here — an oversized overlay
   *  breaks tri-zone drop detection (its center no longer tracks the cursor). */
  renderOverlayCard?: (todo: Todo) => ReactNode
  /** Cross-group drop — apply the target group's meaning to the todo (e.g.
   *  reschedule its due date). Omit to disable cross-group dragging. */
  onGroupDrop?: (todo: Todo, groupKey: string) => void
  /** Same-group reorder: place id right after afterId (null = first). Omit to
   *  disable in-group reordering (views sorted by the server ignore it). */
  onReorder?: (id: number, afterId: number | null) => void
  /** Drop onto the middle of another card: make the dragged todo a child of
   *  it (tree-view semantics — the page reparents via the move API). */
  onNest?: (draggedId: number, parentId: number) => void
  /** Class of the group stack (the outer container). */
  className?: string
  /** Class of each group's card container — lists vs grid layouts. */
  itemAreaClass?: string
}

// Drag ids are namespaced so handlers can tell cards apart from group bodies.
// A group's SortableContext and droppable body share the same id: dropping on
// a card reports it via sortable.containerId, on the body via the id itself.
const itemId = (todoId: number) => `t${todoId}`
const groupId = (key: string) => `group:${key}`


/**
 * Vertical stack of todo groups with drag & drop — the flat-view counterpart
 * of the kanban board. Dropping a card on another group calls onGroupDrop
 * (the page applies the group's meaning: timeline → reschedule to that date,
 * grouped → 今天/明天/…); dropping within a group reorders via onReorder
 * (translated to the backend's after_id semantics, only meaningful when the
 * list is sorted manually).
 */
export default function TodoSortableGroups({
  groups,
  renderCard,
  renderOverlayCard,
  onGroupDrop,
  onReorder,
  onNest,
  className = 'space-y-3',
  itemAreaClass = 'space-y-1.5',
}: TodoSortableGroupsProps) {
  const todoById = useMemo(() => {
    const m = new Map<number, Todo>()
    for (const g of groups) for (const t of g.items) m.set(t.id, t)
    return m
  }, [groups])

  // Local group→ids state drives the cross-group drag preview (the card jumps
  // to the hovered group before the server mutation lands). Re-synced whenever
  // the derived groups change, but never mid-drag.
  const [byGroup, setByGroup] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.items.map((t) => t.id)])),
  )
  const dragging = useRef(false)
  // `byGroup` intentionally changes during a cross-group preview. Keep the
  // authoritative source separately so drag end can still distinguish a real
  // cross-group drop from a same-group reorder.
  const sourceGroup = useRef<string | null>(null)
  useEffect(() => {
    if (dragging.current) return
    setByGroup(Object.fromEntries(groups.map((g) => [g.key, g.items.map((t) => t.id)])))
  }, [groups])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const [activeId, setActiveId] = useState<number | null>(null)
  // Card currently hovered in its middle zone — rendered with a nest affordance
  // (ring + ↳ badge) so the user sees the drop will create a parent-child link.
  const [nestTarget, setNestTarget] = useState<number | null>(null)

  const findGroupOfCard = (cardId: string): string | null => {
    const id = Number(cardId.slice(1))
    for (const [key, ids] of Object.entries(byGroup)) {
      if (ids.includes(id)) return key
    }
    return null
  }

  const overGroup = (over: { id: string | number; data?: { current?: Record<string, unknown> } } | null): string | null => {
    if (!over) return null
    const containerId = (over.data?.current?.sortable as { containerId?: string } | undefined)?.containerId
    if (containerId?.startsWith('group:')) return containerId.slice(6)
    const s = String(over.id)
    return s.startsWith('group:') ? s.slice(6) : null
  }

  const handleDragStart = (e: DragStartEvent) => {
    dragging.current = true
    sourceGroup.current = findGroupOfCard(String(e.active.id))
    setActiveId(Number(String(e.active.id).slice(1)))
  }

  // Live preview: while dragging over another group, move the card into that
  // group's local list so the placeholder renders there (cross-group only).
  // Hovering the MIDDLE of a card instead highlights it as a nest target —
  // the drop will reparent, so no group-move preview is shown.
  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) {
      setNestTarget(null)
      return
    }
    const from = findGroupOfCard(String(active.id))
    const to = overGroup(over)
    if (!from || !to) return
    const overStr = String(over.id)
    const overCardId = overStr.startsWith('group:') ? null : Number(overStr.slice(1))
    const draggedId = Number(String(active.id).slice(1))
    if (overCardId != null && overCardId !== draggedId && onNest &&
        cardDropZone(active.rect.current.translated, over.rect) === 'middle') {
      setNestTarget(overCardId)
      return
    }
    setNestTarget(null)
    if (!onGroupDrop || from === to) return
    setByGroup((prev) => {
      const fromIds = prev[from] ?? []
      const toIds = prev[to] ?? []
      const id = Number(String(active.id).slice(1))
      if (!fromIds.includes(id)) return prev
      let insertAt = toIds.length
      const s = String(over.id)
      if (!s.startsWith('group:')) {
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
    setActiveId(null)
    setNestTarget(null)
    const { active, over } = e
    const from = sourceGroup.current ?? findGroupOfCard(String(active.id))
    sourceGroup.current = null
    if (!over) return
    const id = Number(String(active.id).slice(1))
    const todo = todoById.get(id)
    const to = overGroup(over)
    if (!todo || !to || !from) return

    // Middle-of-a-card drop: reparent the dragged todo under the hovered card
    // (appended as its last child). Takes precedence over group semantics so
    // "drop ON a task" always means nesting, in every group.
    const overStr = String(over.id)
    const overCardId = overStr.startsWith('group:') ? null : Number(overStr.slice(1))
    if (overCardId != null && overCardId !== id && onNest &&
        cardDropZone(active.rect.current.translated, over.rect) === 'middle') {
      onNest(id, overCardId)
      return
    }

    if (to !== from) {
      onGroupDrop?.(todo, to)
      return
    }

    if (!onReorder) return
    // Same group: translate the drop into the backend's after_id (the todo to
    // place behind), mirroring the kanban logic. dnd-kit reports the hovered
    // card; the local preview already moved the dragged card to its position.
    const ids = byGroup[to] ?? []
    const idx = ids.indexOf(id)
    const overTodoId = overCardId
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
    sourceGroup.current = null
    setActiveId(null)
    setNestTarget(null)
    setByGroup(Object.fromEntries(groups.map((g) => [g.key, g.items.map((t) => t.id)])))
  }

  const activeTodo = activeId != null ? todoById.get(activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={className}>
        {groups.map((g) => (
          <div key={g.key}>
            {g.label != null && <div className="mb-1.5">{g.label}</div>}
            <GroupArea
              groupKey={g.key}
              itemIds={(byGroup[g.key] ?? []).map(itemId)}
              itemAreaClass={itemAreaClass}
              renderCard={renderCard}
              todoById={todoById}
              nestTarget={nestTarget}
            />
          </div>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTodo ? (
          <div className="rotate-2 scale-[0.97] shadow-lg opacity-90 w-64 cursor-grabbing">
            {(renderOverlayCard ?? renderCard)(activeTodo)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function GroupArea({
  groupKey,
  itemIds,
  itemAreaClass,
  renderCard,
  todoById,
  nestTarget,
}: {
  groupKey: string
  itemIds: string[]
  itemAreaClass: string
  renderCard: (todo: Todo) => ReactNode
  todoById: Map<number, Todo>
  nestTarget: number | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId(groupKey) })
  return (
    <SortableContext id={groupId(groupKey)} items={itemIds} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`${itemAreaClass} rounded-lg transition-colors ring-2 ${isOver ? 'ring-primary/60 bg-primary/5' : 'ring-transparent'}`}
      >
        {itemIds.map((sid) => (
          <SortableCard
            key={sid}
            todoId={Number(sid.slice(1))}
            todoById={todoById}
            renderCard={renderCard}
            nest={nestTarget === Number(sid.slice(1))}
          />
        ))}
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
  })
  const todo = todoById.get(todoId)
  if (!todo) return null
  return (
    <div
      ref={setNodeRef}
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
