import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Repeat, Loader2 } from 'lucide-react'
import { isoToLocalInput } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { DialogFooter } from './ui/dialog'
import BuddyPicker from './BuddyPicker'
import { TodoChecklist } from './TodoChecklist'
import { useCreateTodo, useUpdateTodo, useReplaceTodoTags, useMoveTodo } from '../hooks/api/useTodos'
import { descendantIds } from '../lib/buildTodoTree'
import type { Todo, Contact, Tag, TodoStatus, TodoUpdateInput } from '../types'

const COLORS = [
  { value: '', label: 'Default' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
]

// dueChipValue returns a datetime-local string for today + offset days at 09:00.
function dueChipValue(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(9, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface TodoFormProps {
  editing: Todo | null
  contacts: Contact[]
  tags: Tag[]
  parentCandidates?: Todo[]
  presetParentId?: number | null
  onContactsChange: (contacts: Contact[]) => void
  onClose: () => void
}

/** Shared todo create/edit fields — hosted by TodoFormDialog (create modal)
 *  and TodoDetailDrawer (right slide-over). State initializes from `editing`
 *  once per mount; both shells remount via a key on the todo id. */
export function TodoForm({ editing, contacts, tags, parentCandidates, presetParentId, onContactsChange, onClose }: TodoFormProps) {
  const { t } = useTranslation()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const replaceTags = useReplaceTodoTags()
  const moveTodo = useMoveTodo()

  const [formTitle, setFormTitle] = useState(editing?.title ?? '')
  const [formDesc, setFormDesc] = useState(editing?.description ?? '')
  const [formStatus, setFormStatus] = useState<TodoStatus>(editing?.status ?? 'pending')
  const [formPriority, setFormPriority] = useState<'low' | 'normal' | 'high'>(editing?.priority ?? 'normal')
  const [formDueTime, setFormDueTime] = useState(editing?.due_time ? isoToLocalInput(editing.due_time) : '')
  const [formStartTime, setFormStartTime] = useState(editing?.start_time ? isoToLocalInput(editing.start_time) : '')
  const [formAmount, setFormAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [formAmountType, setFormAmountType] = useState<'' | 'income' | 'expense'>(editing?.amount_type ?? '')
  const [formContactIds, setFormContactIds] = useState<number[]>(editing?.contact_ids ?? [])
  const [formColor, setFormColor] = useState(editing?.color ?? '')
  const [formRepeat, setFormRepeat] = useState<string>(editing?.repeat ?? '')
  const [formRepeatInterval, setFormRepeatInterval] = useState<number>(editing?.repeat_interval && editing.repeat_interval > 0 ? editing.repeat_interval : 1)
  const [formTagIds, setFormTagIds] = useState<number[]>(editing?.tags?.map((tg) => tg.id) ?? [])
  const [formParentId, setFormParentId] = useState<number | null>(editing?.parent_id ?? presetParentId ?? null)

  // Disallow picking self or a descendant as the new parent (backend would reject
  // the cycle); keeps the picker honest when editing.
  const blockedParents = editing ? descendantIds(parentCandidates ?? [], editing.id) : new Set<number>()

  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) return
    let todoId: number | undefined
    if (editing) {
      const data: TodoUpdateInput = {
        title: formTitle.trim(),
        description: formDesc,
        status: formStatus,
        priority: formPriority,
        due_time: formDueTime ? new Date(formDueTime).toISOString() : null,
        start_time: formStartTime ? new Date(formStartTime).toISOString() : null,
        amount: formAmount ? parseFloat(formAmount) : null,
        amount_type: formAmountType,
        contact_ids: formContactIds,
        color: formColor,
        repeat: formRepeat,
        repeat_interval: formRepeatInterval,
      }
      // Clearing a populated nullable field removes it server-side.
      if (editing.due_time && !formDueTime) data.clear_due_time = true
      if (editing.start_time && !formStartTime) data.clear_start_time = true
      if (editing.amount != null && !formAmount) data.clear_amount = true
      await updateTodo.mutateAsync({ id: editing.id, data })
      todoId = editing.id
    } else {
      const payload: Partial<Todo> = {
        title: formTitle.trim(),
        description: formDesc,
        status: formStatus === 'pending' ? undefined : formStatus,
        priority: formPriority,
        due_time: formDueTime ? new Date(formDueTime).toISOString() : undefined,
        start_time: formStartTime ? new Date(formStartTime).toISOString() : undefined,
        amount: formAmount ? parseFloat(formAmount) : undefined,
        amount_type: formAmountType,
        contact_ids: formContactIds,
        color: formColor,
        repeat: formRepeat || undefined,
        repeat_interval: formRepeatInterval || undefined,
        parent_id: formParentId ?? undefined,
      }
      const created = await createTodo.mutateAsync(payload)
      todoId = created?.data?.id
    }
    // Reparenting goes through the dedicated move endpoint — Update doesn't
    // persist parent_id. Skipped on create (parent_id is already in the payload).
    if (editing && formParentId !== (editing.parent_id ?? null)) {
      try {
        await moveTodo.mutateAsync({ id: editing.id, parentId: formParentId, afterId: null })
      } catch {
        // backend rejects cycles; the change just won't apply
      }
    }
    // Persist tag selection (idempotent replace). Non-fatal if it fails.
    if (todoId) {
      try {
        await replaceTags.mutateAsync({ todoId, tagIds: formTagIds })
      } catch {
        // ignore tag sync failure
      }
    }
    onClose()
  }, [editing, formTitle, formDesc, formStatus, formPriority, formDueTime, formStartTime, formAmount, formAmountType, formContactIds, formColor, formRepeat, formRepeatInterval, formTagIds, formParentId, updateTodo, createTodo, replaceTags, moveTodo, onClose])

  return (
    <>
      {/* flex-1 + overflow: the only scrollable region — DialogContent is a
          flex column, so the footer below stays pinned and never overlaps the
          last fields (the old sticky-inside-scroll approach always covered
          them at full scroll). */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
        <div className="space-y-1.5">
          <Label>{t('todos.title_field')} *</Label>
          <Input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            // Fast create flow: focus the title on open, Enter submits.
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && formTitle.trim()) {
                e.preventDefault()
                void handleSave()
              }
            }}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('todos.description')}</Label>
          <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} />
        </div>
        {parentCandidates && parentCandidates.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t('todos.parent')}</Label>
            <select
              value={formParentId ?? ''}
              onChange={(e) => setFormParentId(e.target.value ? Number(e.target.value) : null)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">{t('todos.parentNone')}</option>
              {parentCandidates
                .filter((c) => c.id !== editing?.id && !blockedParents.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
            </select>
          </div>
        )}
        {editing && <TodoChecklist todoId={editing.id} />}
        <div className="space-y-1.5">
          <Label>{t('todos.status')}</Label>
          <div className="flex gap-1">
            {(['pending', 'done', 'abandoned'] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={formStatus === s ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setFormStatus(s)}
              >
                {t(`todos.${s}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t('todos.priority')}</Label>
            <div className="flex gap-1">
              {(['low', 'normal', 'high'] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={formPriority === p ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setFormPriority(p)}
                >
                  {t(`todos.${p}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('todos.dueTime')}</Label>
            <Input type="datetime-local" value={formDueTime} onChange={(e) => setFormDueTime(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setFormDueTime(dueChipValue(0))}>{t('todos.today')}</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setFormDueTime(dueChipValue(1))}>{t('todos.tomorrow')}</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setFormDueTime(dueChipValue(7))}>{t('todos.thisWeek')}</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setFormDueTime('')}>{t('todos.clear')}</Button>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />{t('todos.repeat')}</Label>
          <select
            value={formRepeat}
            onChange={(e) => setFormRepeat(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">{t('todos.repeatNone')}</option>
            <option value="daily">{t('todos.repeatDaily')}</option>
            <option value="weekly">{t('todos.repeatWeekly')}</option>
            <option value="weekdays">{t('todos.repeatWeekdays')}</option>
            <option value="monthly">{t('todos.repeatMonthly')}</option>
            <option value="yearly">{t('todos.repeatYearly')}</option>
          </select>
          {formRepeat && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-xs text-muted-foreground">{t('todos.repeatEvery')}</span>
              <Input
                type="number"
                min={1}
                value={formRepeatInterval}
                onChange={(e) => setFormRepeatInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="h-8 w-16"
              />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t('todos.startTime')}</Label>
          <div className="flex gap-2">
            <Input type="datetime-local" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="flex-1" />
            {formStartTime && (
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setFormStartTime('')}>{t('todos.clear')}</Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t('todos.amount')}</Label>
            <Input
              type="number"
              step="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('todos.amountType')}</Label>
            <div className="flex gap-1">
              {(['', 'income', 'expense'] as const).map((at) => (
                <Button
                  key={at}
                  type="button"
                  variant={formAmountType === at ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setFormAmountType(at)}
                >
                  {at === '' ? '-' : t(`todos.${at}`)}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t('todos.buddy')}</Label>
          <BuddyPicker
            buddies={contacts}
            selectedIds={formContactIds}
            onChange={setFormContactIds}
            onBuddiesUpdate={onContactsChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setFormColor(c.value)}
                className={`h-6 w-6 rounded-full border-2 transition-colors ${formColor === c.value ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}
                style={{ backgroundColor: c.value || 'transparent', backgroundImage: c.value ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                title={c.label}
              />
            ))}
          </div>
        </div>
        {tags.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t('todos.tags')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const selected = formTagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setFormTagIds((ids) => (selected ? ids.filter((i) => i !== tag.id) : [...ids, tag.id]))}
                    className="px-2 py-0.5 rounded-full text-xs border transition-colors"
                    style={selected
                      ? { backgroundColor: tag.color || '#6b7280', borderColor: tag.color || '#6b7280', color: '#fff' }
                      : { borderColor: tag.color || '#d1d5db', color: tag.color || '#6b7280' }}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={!formTitle.trim() || createTodo.isPending || updateTodo.isPending}>
          {(createTodo.isPending || updateTodo.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {editing ? t('common.save') : t('common.create')}
        </Button>
      </DialogFooter>
    </>
  )
}
