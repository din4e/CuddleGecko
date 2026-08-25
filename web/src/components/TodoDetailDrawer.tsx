import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { TodoForm } from './TodoForm'
import type { Todo, Contact, Tag } from '../types'

interface TodoDetailDrawerProps {
  todo: Todo | null
  open: boolean
  contacts: Contact[]
  tags: Tag[]
  parentCandidates?: Todo[]
  onContactsChange: (contacts: Contact[]) => void
  onClose: () => void
}

/** Right-side slide-over with the full task detail form — opened by clicking a
 *  card/row anywhere in the todo views. The form remounts per todo id so its
 *  state always matches the todo being viewed. */
export function TodoDetailDrawer({ todo, open, contacts, tags, parentCandidates, onContactsChange, onClose }: TodoDetailDrawerProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open && todo != null} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="pr-8">{todo?.title ?? t('todos.editTodo')}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {todo && (
            <TodoForm
              key={todo.id}
              editing={todo}
              contacts={contacts}
              tags={tags}
              parentCandidates={parentCandidates}
              onContactsChange={onContactsChange}
              onClose={onClose}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
