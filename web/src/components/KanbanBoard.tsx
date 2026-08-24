import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircle2, Flame, Tag as TagIcon, Plus, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { Todo, Tag } from '../types'
import type { KanbanColumn } from '../api/settings'
import { bucketByColumns } from '../lib/kanban'

export interface KanbanBoardProps {
  todos: Todo[]
  columns: KanbanColumn[]
  tags: Tag[]
  addColumn: (col: KanbanColumn) => void
  removeColumn: (id: string) => void
  renderCard: (todo: Todo) => ReactNode
  /** Drop onto a column with a different predicate: apply the predicate. */
  onCardDropColumn: (todo: Todo, col: KanbanColumn) => void
  /** Reorder within a column; afterId = the todo to place behind, null = first. */
  onReorder: (id: number, afterId: number | null) => void
  /** Quick-create inside a column; the page applies the column predicate. */
  onCreateInColumn: (title: string, col: KanbanColumn) => void
}

// Sortable item ids are strings; column containers use a "col:" prefix so a
// drop directly on the column body (not a card) resolves to that column.
const colDroppableId = (colId: string) => `col:${colId}`
const itemId = (todoId: number) => `t${todoId}`

export default function KanbanBoard({
  todos,
  columns,
  tags,
  addColumn,
  removeColumn,
  renderCard,
  onCardDropColumn,
  onReorder,
  onCreateInColumn,
}: KanbanBoardProps) {
  const { t } = useTranslation()

  const board = useMemo(
    () => bucketByColumns(todos.filter((td) => td.status === 'pending' || td.status === 'done'), columns),
    [todos, columns],
  )
  const todoById = useMemo(() => new Map(todos.map((td) => [td.id, td])), [todos])

  // Local container state drives the drag preview (cards can be dragged across
  // columns before the server mutation lands). Re-synced whenever the derived
  // board changes; a drag keeps its own working copy until commit/cancel.
  const [containers, setContainers] = useState<Record<string, number[]>>(() =>
    Object.fromEntries([...board.byColumn].map(([id, items]) => [id, items.map((td) => td.id)])),
  )
  const boardSig = JSON.stringify([
    columns.map((c) => c.id),
    todos.map((td) => td.id),
  ])
  // Sync local state only when not mid-drag, so an in-flight refetch (e.g. the
  // optimistic toggle from a previous drop) can't clobber the drag preview.
  const dragging = useRef(false)
  useEffect(() => {
    if (dragging.current) return
    setContainers(Object.fromEntries([...board.byColumn].map(([id, items]) => [id, items.map((td) => td.id)])))
  }, [board])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const findContainer = (id: string): string | null => {
    if (id.startsWith('col:')) return id.slice(4)
    for (const [colId, items] of Object.entries(containers)) {
      if (items.includes(Number(id.slice(1)))) return colId
    }
    return null
  }

  const handleDragStart = (e: DragStartEvent) => {
    dragging.current = true
    setActiveId(Number(String(e.active.id).slice(1)))
  }

  // GitLab-style live preview: while dragging over another column, move the
  // card into that column's local list so the placeholder renders there.
  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const activeStr = String(active.id)
    const overStr = String(over.id)
    const from = findContainer(activeStr)
    const to = overStr.startsWith('col:') ? overStr.slice(4) : findContainer(overStr)
    if (!from || !to || from === to) return
    setContainers((prev) => {
      const fromItems = prev[from] ?? []
      const toItems = prev[to] ?? []
      const id = Number(activeStr.slice(1))
      if (!fromItems.includes(id)) return prev
      let insertAt = toItems.length
      if (!overStr.startsWith('col:')) {
        const overIdx = toItems.indexOf(Number(overStr.slice(1)))
        if (overIdx >= 0) insertAt = overIdx
      }
      return {
        ...prev,
        [from]: fromItems.filter((it) => it !== id),
        [to]: [...toItems.slice(0, insertAt), id, ...toItems.slice(insertAt)],
      }
    })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    dragging.current = false
    setActiveId(null)
    const { active, over } = e
    const activeStr = String(active.id)
    const id = Number(activeStr.slice(1))
    const todo = todoById.get(id)
    if (!todo) return

    const to = over ? (String(over.id).startsWith('col:') ? String(over.id).slice(4) : findContainer(String(over.id))) : null
    const from = columns.find((c) => c.id === undefined ? false : (containers[c.id] ?? []).includes(id))?.id

    if (over && to && to !== from && to !== '__other') {
      const col = columns.find((c) => c.id === to)
      if (col) onCardDropColumn(todo, col)
      return
    }
    if (over && to) {
      // Same column: commit the local order via the reorder API (after_id).
      const items = containers[to] ?? []
      const idx = items.indexOf(id)
      if (idx > 0) onReorder(id, items[idx - 1])
      else if (idx === 0) onReorder(id, null)
    }
  }

  const handleDragCancel = () => {
    dragging.current = false
    setActiveId(null)
    setContainers(Object.fromEntries([...board.byColumn].map(([id, items]) => [id, items.map((td) => td.id)])))
  }

  // --- Add-column form (kept from the previous inline implementation) ---
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
      <div className="flex gap-3 overflow-x-auto pb-2 items-start">
        {columns.map((col) => {
          const items = containers[col.id] ?? []
          return (
            <BoardColumn
              key={col.id}
              col={col}
              itemIds={items.map(itemId)}
              onRemove={() => removeColumn(col.id)}
              renderCard={renderCard}
              todoById={todoById}
              onCreate={(title) => onCreateInColumn(title, col)}
            />
          )
        })}
        {board.unmatched.length > 0 && (
          <div className="w-64 shrink-0">
            <h3 className="text-sm font-medium mb-1.5 flex items-center gap-2 text-muted-foreground sticky top-0 z-[1] bg-background/95 backdrop-blur py-1">
              {t('todos.kanbanOther')}
              <span className="text-xs rounded-full bg-muted px-1.5 py-0.5">{board.unmatched.length}</span>
            </h3>
            <div className="space-y-1.5 min-h-[100px] bg-muted/20 rounded-lg p-2 border-2 border-dashed">
              {board.unmatched.map((todo) => (
                <div key={todo.id} className="opacity-80">{renderCard(todo)}</div>
              ))}
            </div>
          </div>
        )}
        {/* Add column */}
        <div className="w-44 shrink-0">
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
                  </>}
                  {newColKind === 'priority' && <>
                    <SelectItem value="high">{t('todos.high')}</SelectItem>
                    <SelectItem value="normal">{t('todos.normal')}</SelectItem>
                    <SelectItem value="low">{t('todos.low')}</SelectItem>
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
              className="flex min-h-[120px] w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              {t('todos.kanbanAddColumn')}
            </button>
          )}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTodo ? (
          <div className="rotate-2 scale-[0.97] shadow-lg opacity-90 w-64 cursor-grabbing">{renderCard(activeTodo)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  col,
  itemIds,
  onRemove,
  renderCard,
  todoById,
  onCreate,
}: {
  col: KanbanColumn
  itemIds: string[]
  onRemove: () => void
  renderCard: (todo: Todo) => ReactNode
  todoById: Map<number, Todo>
  onCreate: (title: string) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: colDroppableId(col.id) })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const icon = col.kind === 'status' && col.value === 'done'
    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
    : col.kind === 'priority' ? <Flame className="h-4 w-4 text-orange-500" /> : <TagIcon className="h-4 w-4 text-blue-500" />

  const submit = () => {
    const v = title.trim()
    if (v) onCreate(v)
    setTitle('')
    setAdding(false)
  }

  return (
    <div className="w-64 shrink-0 flex flex-col">
      <h3 className="group/col text-sm font-medium mb-1.5 flex items-center gap-2 sticky top-0 z-[1] bg-background/95 backdrop-blur py-1">
        {icon}
        <span className="truncate">{col.label}</span>
        <span className="text-xs rounded-full bg-muted px-1.5 py-0.5">{itemIds.length}</span>
        <button
          type="button"
          className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/col:opacity-100"
          onClick={onRemove}
          aria-label={t('todos.kanbanRemoveColumn')}
          title={t('todos.kanbanRemoveColumn')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </h3>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 space-y-1.5 min-h-[160px] max-h-[calc(100vh-19rem)] overflow-y-auto bg-muted/30 rounded-lg p-2 transition-colors ring-2 ${isOver ? 'ring-primary/60 bg-primary/5' : 'ring-transparent'}`}
        >
          {itemIds.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-6">{t('todos.noTodos')}</p>
          )}
          {itemIds.map((sid) => (
            <SortableCard key={sid} todoId={Number(sid.slice(1))} todoById={todoById} renderCard={renderCard} />
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
    </div>
  )
}

function SortableCard({
  todoId,
  todoById,
  renderCard,
}: {
  todoId: number
  todoById: Map<number, Todo>
  renderCard: (todo: Todo) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: itemId(todoId) })
  const todo = todoById.get(todoId)
  if (!todo) return null
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none ${isDragging ? 'opacity-30' : 'hover:shadow-sm'}`}
    >
      {renderCard(todo)}
    </div>
  )
}
