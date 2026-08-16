import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, ChevronUp, ChevronDown, ArrowUpRight, Trash2, Plus } from 'lucide-react'
import { isoToLocalInput } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  useTodoItems,
  useCreateTodoItem,
  useToggleTodoItem,
  useDeleteTodoItem,
  useUpdateTodoItem,
  useReorderTodoItem,
  usePromoteTodoItem,
} from '../hooks/api/useTodos'

/** Renders and manages a todo's checklist (subtask) items. Self-contained. */
export function TodoChecklist({ todoId }: { todoId: number }) {
  const { t } = useTranslation()
  const createItem = useCreateTodoItem(todoId)
  const toggleItem = useToggleTodoItem(todoId)
  const deleteItem = useDeleteTodoItem(todoId)
  const updateItem = useUpdateTodoItem(todoId)
  const reorderItem = useReorderTodoItem(todoId)
  const promoteItem = usePromoteTodoItem(todoId)
  const { data: editingItems } = useTodoItems(todoId)

  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [itemDraft, setItemDraft] = useState('')
  const [newItemContent, setNewItemContent] = useState('')

  const list = editingItems ?? []

  const handleAddItem = async () => {
    if (!newItemContent.trim()) return
    try {
      await createItem.mutateAsync(newItemContent.trim())
      setNewItemContent('')
    } catch {
      // ignore
    }
  }

  const commitItem = async (itemId: number) => {
    setEditingItemId(null)
    const next = itemDraft.trim()
    const existing = list.find((it) => it.id === itemId)
    if (!next || next === existing?.content) return
    try {
      await updateItem.mutateAsync({ itemId, content: next, due_time: existing?.due_time ?? null })
    } catch {
      // ignore
    }
  }

  const handleItemDue = async (itemId: number, value: string) => {
    const existing = list.find((it) => it.id === itemId)
    if (!existing) return
    try {
      await updateItem.mutateAsync({
        itemId,
        content: existing.content,
        due_time: value ? new Date(value).toISOString() : null,
        clear_due_time: !value,
      })
    } catch {
      // ignore
    }
  }

  const moveItem = async (itemId: number, afterId: number | null) => {
    try {
      await reorderItem.mutateAsync({ itemId, afterId })
    } catch {
      // ignore
    }
  }
  const moveItemUp = (i: number) => {
    if (i <= 0) return
    moveItem(list[i].id, i >= 2 ? list[i - 2].id : null)
  }
  const moveItemDown = (i: number) => {
    if (i >= list.length - 1) return
    moveItem(list[i].id, list[i + 1].id)
  }

  const handlePromote = async (itemId: number) => {
    try {
      await promoteItem.mutateAsync(itemId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        {list.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
            <button
              type="button"
              onClick={() => toggleItem.mutate(item.id)}
              className="shrink-0 cursor-pointer bg-transparent border-none"
            >
              {item.done
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <Circle className="h-4 w-4 text-muted-foreground hover:text-primary" />}
            </button>
            {editingItemId === item.id ? (
              <input
                autoFocus
                value={itemDraft}
                onChange={(e) => setItemDraft(e.target.value)}
                onBlur={() => commitItem(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitItem(item.id) }
                  if (e.key === 'Escape') setEditingItemId(null)
                }}
                className="flex-1 min-w-0 text-sm bg-transparent border-b border-primary outline-none"
              />
            ) : (
              <span
                onClick={() => { setEditingItemId(item.id); setItemDraft(item.content) }}
                className={`flex-1 min-w-0 text-sm cursor-text ${item.done ? 'line-through text-muted-foreground' : ''}`}
              >
                {item.content}
              </span>
            )}
            <Input
              type="datetime-local"
              value={item.due_time ? isoToLocalInput(item.due_time) : ''}
              onChange={(e) => handleItemDue(item.id, e.target.value)}
              className="h-7 w-44"
              aria-label={t('todos.dueTime')}
            />
            <div className="flex flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => moveItemUp(i)}
                title={t('todos.moveUp')}
                className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground leading-none"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={i === list.length - 1}
                onClick={() => moveItemDown(i)}
                title={t('todos.moveDown')}
                className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground leading-none"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-6 w-6 p-0"
              title={t('todos.promoteTitle')}
              onClick={() => handlePromote(item.id)}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-6 w-6 p-0 text-destructive"
              onClick={() => deleteItem.mutate(item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newItemContent}
            onChange={(e) => setNewItemContent(e.target.value)}
            placeholder={t('todos.newItem')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem() } }}
            className="h-8"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-9 p-0"
            onClick={handleAddItem}
            disabled={!newItemContent.trim() || createItem.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
