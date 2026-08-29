import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { TodoForm } from './TodoForm'
import TodoSubtaskList from './TodoSubtaskList'
import { useTodoChildrenMap } from '../hooks/api/useTodos'
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
}

/** Loads the todo's whole subtree: starts with direct children, then keeps
 *  adding one children query per discovered child until nothing new appears.
 *  Every child gets its own unfiltered slice so grandchild rows always show,
 *  regardless of the smart list that surfaced the parent. */
function DrawerSubtasks({ todo, onToggle, onDelete, onStartPomodoro, onOpenTodo, onCreateChild }: {
  todo: Todo
  onToggle?: (todo: Todo) => void
  onDelete?: (todo: Todo) => void
  onStartPomodoro?: (todo: Todo) => void
  onOpenTodo: (todo: Todo) => void
  onCreateChild?: (parent: Todo, title: string) => void
}) {
  const { t } = useTranslation()
  // Accumulated parent ids whose children slices we need (root + descendants
  // with children). Grows as slices land — mirrors the page's "expand all";
  // the component is keyed by todo.id (see usage) so switching todos remounts
  // with a fresh, empty set.
  const [extraIds, setExtraIds] = useState<Set<number>>(() => new Set())

  const parentIds = [todo.id, ...extraIds]
  const childrenMap = useTodoChildrenMap(parentIds, {})

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

  return (
    <div className="mt-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('todos.subtasks')}
      </h3>
      <TodoSubtaskList
        todo={todo}
        childrenByParent={childrenByParent}
        onToggle={(sub) => onToggle?.(sub)}
        onEdit={onOpenTodo}
        onAddChild={onOpenTodo}
        onCreateChild={onCreateChild}
        onDelete={onDelete}
        onStartPomodoro={onStartPomodoro}
      />
    </div>
  )
}

/** Right-side slide-over with the full task detail form — opened by clicking a
 *  card/row anywhere in the todo views. The form remounts per todo id so its
 *  state always matches the todo being viewed. Subtasks (to any depth) render
 *  beneath the form so a subtree is manageable without leaving the drawer. */
export function TodoDetailDrawer({ todo, open, contacts, tags, parentCandidates, onContactsChange, onClose, onToggleSubtask, onDeleteSubtask, onStartPomodoro, onOpenTodo, onCreateChild }: TodoDetailDrawerProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open && todo != null} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="pr-8">{todo?.title ?? t('todos.editTodo')}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {todo && (
            <>
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
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
