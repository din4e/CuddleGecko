import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Button } from './ui/button'
import { TodoForm } from './TodoForm'
import TodoSubtaskList from './TodoSubtaskList'
import { AddChildInput } from './AddChildInput'
import { InlineMarkdown } from './InlineMarkdown'
import { TodoHistory } from './TodoHistory'
import { useTodoChildrenMap } from '../hooks/api/useTodos'
import type { SubtaskMoveAfterId } from './TodoSubtaskList'
import type { Todo, Contact, Tag } from '../types'

interface TodoDetailDrawerProps {
  todo: Todo | null
  open: boolean
  contacts: Contact[]
  tags: Tag[]
  parentCandidates?: Todo[]
  onContactsChange: (contacts: Contact[]) => void
  onClose: () => void
  /** Subtask-area handlers, wired by the page (toggle/confirm-delete/pomodoro)
   *  and "open this subtask in the drawer" (onOpenTodo). */
  onToggleSubtask?: (todo: Todo) => void
  onDeleteSubtask?: (todo: Todo) => void
  onStartPomodoro?: (todo: Todo) => void
  onOpenTodo?: (todo: Todo) => void
  /** Inline quick-add under any subtask row (page's create handler). */
  onCreateChild?: (parent: Todo, title: string) => void
  /** The page's one-click "hide completed" toggle — done subtask rows whose
   *  whole subtree is done drop out here too, same rule as the cards. */
  hideDone?: boolean
  /** Subtask drag & drop, sharing the page's drag state so a drag started on
   *  a card's subtask can finish on a drawer row (and vice versa). */
  subtaskDragId?: number | null
  onSubtaskDragIdChange?: (id: number | null) => void
  onMoveSubtask?: (id: number, parentId: number | null, afterId: SubtaskMoveAfterId) => void
}

/** Loads the todo's whole subtree: starts with direct children, then keeps
 *  adding one children query per discovered child until nothing new appears.
 *  Every child gets its own unfiltered slice so grandchild rows always show,
 *  regardless of the smart list that surfaced the parent. */
function DrawerSubtasks({ todo, onToggle, onDelete, onStartPomodoro, onOpenTodo, onCreateChild, hideDone, dragId, onDragIdChange, onMove }: {
  todo: Todo
  onToggle?: (todo: Todo) => void
  onDelete?: (todo: Todo) => void
  onStartPomodoro?: (todo: Todo) => void
  onOpenTodo: (todo: Todo) => void
  onCreateChild?: (parent: Todo, title: string) => void
  hideDone?: boolean
  dragId?: number | null
  onDragIdChange?: (id: number | null) => void
  onMove?: (id: number, parentId: number | null, afterId: SubtaskMoveAfterId) => void
}) {
  const { t } = useTranslation()
  // Accumulated parent ids whose children slices we need (root + descendants
  // with children). Grows as slices land — mirrors the page's "expand all";
  // the component is keyed by todo.id (see usage) so switching todos remounts
  // with a fresh, empty set.
  const [extraIds, setExtraIds] = useState<Set<number>>(() => new Set())

  const parentIds = [todo.id, ...extraIds]
  // Pinned manual/asc (same as the tree and the flat views' subtask sections):
  // rows are drag-reorderable, and the default due_date sort would snap every
  // dropped row back to its old slot on refetch.
  const childrenMap = useTodoChildrenMap(parentIds, { sort: 'manual', order: 'asc' })

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const found = new Set<number>()
    for (const slice of childrenMap.values()) {
      for (const c of slice.items) found.add(c.id)
    }
    setExtraIds((prev) => {
      if (found.size === prev.size && [...found].every((id) => prev.has(id))) return prev
      return found
    })
  }, [childrenMap])
  /* eslint-enable react-hooks/set-state-in-effect */
  const childrenByParent = new Map<number, Todo[]>()
  for (const [parentId, slice] of childrenMap) {
    if (slice.items?.length > 0) childrenByParent.set(parentId, slice.items)
  }

  // The drawer's own add entry (right of the section heading) — the subtask
  // list only renders rows, so this is the parent todo's single add control,
  // mirroring the card toolbar's right-side "+".
  const [addingRoot, setAddingRoot] = useState(false)

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('todos.subtasks')}
        </h3>
        {onCreateChild && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground"
            onClick={() => setAddingRoot((v) => !v)}
            aria-label={t('todos.addChild')}
            title={t('todos.addChild')}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
      {addingRoot && onCreateChild && (
        <div className="mb-1">
          <AddChildInput
            placeholder={t('todos.addSubtaskPlaceholder')}
            onCommit={(v) => onCreateChild(todo, v)}
            onDismiss={() => setAddingRoot(false)}
            className="text-xs"
          />
        </div>
      )}
      <TodoSubtaskList
        todo={todo}
        childrenByParent={childrenByParent}
        onToggle={(sub) => onToggle?.(sub)}
        onEdit={onOpenTodo}
        onCreateChild={onCreateChild}
        onDelete={onDelete}
        onStartPomodoro={onStartPomodoro}
        hideDone={hideDone}
        onMove={onMove}
        dragId={dragId}
        onDragIdChange={onDragIdChange}
      />
    </div>
  )
}

/** Right-side slide-over for viewing/editing a todo — opened by clicking a
 *  card/row anywhere in the todo views. Two tabs keep the form and the
 *  modification history each one click away instead of stacked in a very long
 *  scroll. The form remounts per todo id so its state always matches the todo
 *  being viewed. */
export function TodoDetailDrawer({ todo, open, contacts, tags, parentCandidates, onContactsChange, onClose, onToggleSubtask, onDeleteSubtask, onStartPomodoro, onOpenTodo, onCreateChild, hideDone, subtaskDragId, onSubtaskDragIdChange, onMoveSubtask }: TodoDetailDrawerProps) {
  const { t } = useTranslation()

  return (
    <Sheet open={open && todo != null} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="pr-8">
            {todo ? <InlineMarkdown text={todo.title} /> : t('todos.editTodo')}
          </SheetTitle>
        </SheetHeader>
        {todo && (
          <Tabs defaultValue="detail" className="min-h-0 flex-1">
            <TabsList className="mx-4 mt-1.5 shrink-0">
              <TabsTrigger value="detail">{t('todos.tabDetail')}</TabsTrigger>
              <TabsTrigger value="history">{t('todos.history')}</TabsTrigger>
            </TabsList>
            <TabsContent value="detail" className="min-h-0 overflow-y-auto px-4 py-3">
              <TodoForm
                key={todo.id}
                editing={todo}
                contacts={contacts}
                tags={tags}
                parentCandidates={parentCandidates}
                onContactsChange={onContactsChange}
                onClose={onClose}
              />
              <DrawerSubtasks
                key={todo.id}
                todo={todo}
                onToggle={onToggleSubtask}
                onDelete={onDeleteSubtask}
                onStartPomodoro={onStartPomodoro}
                onOpenTodo={(sub) => onOpenTodo?.(sub)}
                onCreateChild={onCreateChild}
                hideDone={hideDone}
                dragId={subtaskDragId}
                onDragIdChange={onSubtaskDragIdChange}
                onMove={onMoveSubtask}
              />
            </TabsContent>
            <TabsContent value="history" className="min-h-0 overflow-y-auto px-4 py-3">
              <TodoHistory key={`history-${todo.id}`} todoId={todo.id} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}
