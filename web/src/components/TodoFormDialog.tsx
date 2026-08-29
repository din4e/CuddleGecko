import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { TodoForm } from './TodoForm'
import type { Todo, Contact, Tag } from '../types'

interface TodoFormDialogProps {
  open: boolean
  editing: Todo | null
  contacts: Contact[]
  tags: Tag[]
  parentCandidates?: Todo[]
  presetParentId?: number | null
  onContactsChange: (contacts: Contact[]) => void
  onClose: () => void
}

/** Create-only modal shell around the shared TodoForm — editing lives in the
 *  TodoDetailDrawer slide-over. */
export function TodoFormDialog({ open, editing, contacts, tags, parentCandidates, presetParentId, onContactsChange, onClose }: TodoFormDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">{editing ? t('todos.editTodo') : t('todos.newTodo')}</DialogTitle>
        </DialogHeader>
        <TodoForm
          editing={editing}
          contacts={contacts}
          tags={tags}
          parentCandidates={parentCandidates}
          presetParentId={presetParentId}
          onContactsChange={onContactsChange}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
