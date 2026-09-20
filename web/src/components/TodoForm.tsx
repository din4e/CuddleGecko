import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Eye, Hourglass, PenLine, Repeat, Loader2 } from 'lucide-react'
import { isoToLocalInput } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { DialogFooter } from './ui/dialog'
import { Markdown } from './Markdown'
import BuddyPicker from './BuddyPicker'
import TodoParentPicker from './TodoParentPicker'
import LabelPicker from './LabelPicker'
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

// dueChipValue returns a datetime-local string for today + offset days at
// 23:59 — a day-level due date means "by end of that day".
function dueChipValue(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(23, 59, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface TodoFormProps {
  editing: Todo | null
  contacts: Contact[]
  tags: Tag[]
  parentCandidates?: Todo[]
  onContactsChange: (contacts: Contact[]) => void
  onClose: () => void
  /** Prefilled due time for create (local datetime-local string) — the
   *  calendar view's per-day quick create. Ignored when editing. */
  initialDueTime?: string
  /** Edit-mode auto-save (detail drawer): every change is persisted shortly
   *  after it's made, so there is no Save button. Ignored for create — a
   *  todo that doesn't exist yet can't be patched. */
  autoSave?: boolean
}

/** Raw editable state, initialized once from the todo being edited. Extracted
 *  so the auto-save snapshot can be built from the same values that seed the
 *  inputs — the initial form must compare equal to "what's on the server". */
interface FormValues {
  title: string
  desc: string
  status: TodoStatus
  priority: 'none' | 'low' | 'normal' | 'high'
  dueTime: string
  startTime: string
  duration: string
  amount: string
  amountType: '' | 'income' | 'expense'
  contactIds: number[]
  color: string
  repeat: string
  repeatInterval: number
  tagIds: number[]
  parentId: number | null
}

function initialFormValues(editing: Todo | null, initialDueTime?: string): FormValues {
  return {
    title: editing?.title ?? '',
    desc: editing?.description ?? '',
    status: editing?.status ?? 'pending',
    priority: editing?.priority ?? 'none',
    dueTime: editing?.due_time ? isoToLocalInput(editing.due_time) : initialDueTime ?? '',
    startTime: editing?.start_time ? isoToLocalInput(editing.start_time) : '',
    duration: editing?.duration ? String(editing.duration) : '',
    amount: editing?.amount != null ? String(editing.amount) : '',
    amountType: editing?.amount_type ?? '',
    contactIds: editing?.contact_ids ?? [],
    color: editing?.color ?? '',
    repeat: editing?.repeat ?? '',
    repeatInterval: editing?.repeat_interval && editing.repeat_interval > 0 ? editing.repeat_interval : 1,
    tagIds: editing?.tags?.map((tg) => tg.id) ?? [],
    parentId: editing?.parent_id ?? null,
  }
}

/** Canonical serialization of the persisted form fields — two equal strings
 *  mean "nothing to save". Order-insensitive lists (contacts, tags) are
 *  sorted so a pure reorder of the picked chips isn't a change. */
function snapshotOf(v: FormValues): string {
  return JSON.stringify({
    title: v.title.trim(),
    description: v.desc,
    status: v.status,
    priority: v.priority,
    due_time: v.dueTime,
    start_time: v.startTime,
    duration: v.duration,
    amount: v.amount,
    amount_type: v.amountType,
    contact_ids: [...v.contactIds].sort((a, b) => a - b),
    color: v.color,
    repeat: v.repeat,
    repeat_interval: v.repeatInterval,
    parent_id: v.parentId,
    tag_ids: [...v.tagIds].sort((a, b) => a - b),
  })
}

/** Shared todo create/edit fields — hosted by TodoFormDialog (create modal)
 *  and TodoDetailDrawer (right slide-over). State initializes from `editing`
 *  once per mount; both shells remount via a key on the todo id. */
export function TodoForm({ editing, contacts, tags, parentCandidates, onContactsChange, onClose, initialDueTime, autoSave }: TodoFormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const replaceTags = useReplaceTodoTags()
  const moveTodo = useMoveTodo()

  const [init] = useState(() => initialFormValues(editing, initialDueTime))
  const [formTitle, setFormTitle] = useState(init.title)
  const [formDesc, setFormDesc] = useState(init.desc)
  const [formStatus, setFormStatus] = useState<TodoStatus>(init.status)
  const [formPriority, setFormPriority] = useState<'none' | 'low' | 'normal' | 'high'>(init.priority)
  const [formDueTime, setFormDueTime] = useState(init.dueTime)
  const [formStartTime, setFormStartTime] = useState(init.startTime)
  // Estimated effort in minutes (TickTick 持续时长); '' = unset.
  const [formDuration, setFormDuration] = useState(init.duration)
  const [formAmount, setFormAmount] = useState(init.amount)
  const [formAmountType, setFormAmountType] = useState<'' | 'income' | 'expense'>(init.amountType)
  const [formContactIds, setFormContactIds] = useState<number[]>(init.contactIds)
  const [formColor, setFormColor] = useState(init.color)
  const [formRepeat, setFormRepeat] = useState<string>(init.repeat)
  const [formRepeatInterval, setFormRepeatInterval] = useState<number>(init.repeatInterval)
  const [formTagIds, setFormTagIds] = useState<number[]>(init.tagIds)
  const [formParentId, setFormParentId] = useState<number | null>(init.parentId)
  const savingRef = useRef(false)
  const savedTodoId = useRef(editing?.id)
  const savedParentId = useRef(editing?.parent_id ?? null)
  const savedTagIds = useRef(editing?.tags?.map((tag) => tag.id) ?? [])
  const [saving, setSaving] = useState(false)
  const [labelCreating, setLabelCreating] = useState(false)
  const [saveError, setSaveError] = useState(false)
  // Auto-save bookkeeping (drawer edit mode only).
  const autoSaveOn = !!autoSave && editing != null
  // True while an IME composition (Chinese pinyin etc.) is in progress —
  // React defers onChange until compositionend, so state lags the visible
  // text and saving mid-composition would persist a half-typed value.
  const [composing, setComposing] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  // Snapshot of the form as of the last successful save; seeded with the
  // pristine form so opening the drawer is never "dirty".
  const savedSnapshotRef = useRef(snapshotOf(init))
  // Latest form snapshot, recomputed every render (cheap JSON stringify) so
  // the unmount flush can compare without stale closures.
  const currentSnapshot = snapshotOf({
    title: formTitle, desc: formDesc, status: formStatus, priority: formPriority,
    dueTime: formDueTime, startTime: formStartTime, duration: formDuration, amount: formAmount,
    amountType: formAmountType, contactIds: formContactIds, color: formColor, repeat: formRepeat,
    repeatInterval: formRepeatInterval, tagIds: formTagIds, parentId: formParentId,
  })
  const currentSnapshotRef = useRef(currentSnapshot)
  // Latest save fn for timers/unmount (they must not capture a stale closure).
  const handleSaveRef = useRef<(opts?: { close?: boolean }) => Promise<void>>(async () => {})
  // In-flight save promise — the unmount flush chains behind it so edits made
  // while a save is running aren't dropped by the component going away.
  const inFlightRef = useRef<Promise<void> | null>(null)
  const labelCandidates = useMemo(() => {
    const map = new Map((editing?.tags ?? []).map((tag) => [tag.id, tag]))
    for (const tag of tags) map.set(tag.id, tag)
    return [...map.values()]
  }, [editing?.tags, tags])
  // Description is markdown: the textarea swaps to a rendered preview while the
  // field has content; clearing the text returns to the editor.
  const [descPreview, setDescPreview] = useState(false)
  // Non-todo extras (amount, buddies, color) fold away by default; start
  // expanded when the edited todo already carries values so nothing hides.
  const hasExtras = editing != null && (editing.amount != null || (editing.contact_ids?.length ?? 0) > 0 || !!editing.color || (editing.duration ?? 0) > 0)
  const [moreOpen, setMoreOpen] = useState(hasExtras)
  // Live count of set extras, shown as a badge while the section is collapsed.
  const extrasSet = [formAmount !== '', formContactIds.length > 0, formColor !== '', formDuration !== ''].filter(Boolean).length

  // Disallow picking self or a descendant as the new parent (backend would reject
  // the cycle); keeps the picker honest when editing.
  const blockedParents = useMemo(
    () => (editing ? new Set([editing.id, ...descendantIds(parentCandidates ?? [], editing.id)]) : new Set<number>()),
    [editing, parentCandidates],
  )

  /** Persists the form. `close: false` (auto-save) keeps the form mounted —
   *  only an explicit Save (create dialog / Enter) closes the shell. */
  const handleSave = useCallback(async (opts?: { close?: boolean }) => {
    const close = opts?.close ?? true
    if (!formTitle.trim() || savingRef.current || labelCreating) return
    savingRef.current = true
    setSaving(true)
    setSaveError(false)
    const run = async () => {
      try {
        let todoId = savedTodoId.current
        if (todoId != null) {
          const data: TodoUpdateInput = {
            title: formTitle.trim(),
            description: formDesc,
            status: formStatus,
            priority: formPriority,
            due_time: formDueTime ? new Date(formDueTime).toISOString() : null,
            start_time: formStartTime ? new Date(formStartTime).toISOString() : null,
            duration: formDuration ? parseInt(formDuration, 10) : 0,
            amount: formAmount ? parseFloat(formAmount) : null,
            amount_type: formAmountType,
            contact_ids: formContactIds,
            color: formColor,
            repeat: formRepeat,
            repeat_interval: formRepeatInterval,
          }
          // Clearing a populated nullable field removes it server-side.
          // Progress is deliberately NOT sent here: the row-bar drag owns it
          // (PATCH /progress), and an omitted field leaves the column untouched.
          if (!formDueTime) data.clear_due_time = true
          if (!formStartTime) data.clear_start_time = true
          if (!formAmount) data.clear_amount = true
          if (!formDuration) data.clear_duration = true
          await updateTodo.mutateAsync({ id: todoId, data })
        } else {
          const payload: Partial<Todo> = {
            title: formTitle.trim(),
            description: formDesc,
            status: formStatus === 'pending' ? undefined : formStatus,
            priority: formPriority,
            due_time: formDueTime ? new Date(formDueTime).toISOString() : undefined,
            start_time: formStartTime ? new Date(formStartTime).toISOString() : undefined,
            duration: formDuration ? parseInt(formDuration, 10) : undefined,
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
          savedTodoId.current = todoId
          savedParentId.current = formParentId
        }
        // Remember each successful step: a failed label/move request leaves the
        // form open, and retrying a new task updates its saved id instead of
        // creating a duplicate. Unchanged labels are never overwritten.
        if (todoId != null && formParentId !== savedParentId.current) {
          await moveTodo.mutateAsync({ id: todoId, parentId: formParentId, afterId: null })
          savedParentId.current = formParentId
        }
        const tagsChanged = formTagIds.length !== savedTagIds.current.length || formTagIds.some((id) => !savedTagIds.current.includes(id))
        if (todoId != null && tagsChanged) {
          await replaceTags.mutateAsync({ todoId, tagIds: formTagIds })
          savedTagIds.current = [...formTagIds]
        }
        // Everything this closure captured is now on the server — snapshot
        // THESE values, not the ref (which may already include edits made
        // while the requests were in flight; those must stay dirty).
        savedSnapshotRef.current = snapshotOf({
          title: formTitle, desc: formDesc, status: formStatus, priority: formPriority,
          dueTime: formDueTime, startTime: formStartTime, duration: formDuration, amount: formAmount,
          amountType: formAmountType, contactIds: formContactIds, color: formColor, repeat: formRepeat,
          repeatInterval: formRepeatInterval, tagIds: formTagIds, parentId: formParentId,
        })
        if (close) onClose()
        else setSavedFlash(true)
      } catch {
        setSaveError(true)
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    }
    const p = run()
    inFlightRef.current = p
    await p
  }, [labelCreating, formTitle, formDesc, formStatus, formPriority, formDueTime, formStartTime, formDuration, formAmount, formAmountType, formContactIds, formColor, formRepeat, formRepeatInterval, formTagIds, formParentId, updateTodo, createTodo, replaceTags, moveTodo, onClose])

  // Keep the "latest value" refs current after every render (effect order
  // matters: this runs before the auto-save/flush effects below, so they and
  // their cleanups always observe this render's values).
  useEffect(() => {
    currentSnapshotRef.current = currentSnapshot
    handleSaveRef.current = handleSave
  })

  // Auto-save: whenever the form drifts from the last saved snapshot, persist
  // it after a short debounce. IME composition, in-flight label creation and
  // an empty title hold the timer off — each is a dep so saving resumes the
  // moment the flag clears (including when a previous save finishes: `saving`).
  useEffect(() => {
    if (!autoSaveOn) return
    if (currentSnapshot === savedSnapshotRef.current) return
    if (!formTitle.trim() || labelCreating || composing || saving) return
    const timer = setTimeout(() => { void handleSaveRef.current({ close: false }) }, 800)
    return () => clearTimeout(timer)
  }, [autoSaveOn, currentSnapshot, formTitle, labelCreating, composing, saving])

  // Close/switch while edits are still pending: flush them so closing the
  // drawer can't drop changes made inside the debounce window. Fire-and-
  // forget — the mutation outruns the unmount; if a save is mid-flight, the
  // flush chains behind it (savingRef would otherwise swallow it).
  useEffect(() => {
    if (!autoSaveOn) return
    return () => {
      if (currentSnapshotRef.current === savedSnapshotRef.current) return
      const fire = () => { void handleSaveRef.current({ close: false }) }
      if (savingRef.current && inFlightRef.current) void inFlightRef.current.then(fire, fire)
      else if (!savingRef.current) fire()
    }
  }, [autoSaveOn])

  return (
    <>
      {/* flex-1 + overflow: the only scrollable region — DialogContent is a
          flex column, so the footer below stays pinned and never overlaps the
          last fields (the old sticky-inside-scroll approach always covered
          them at full scroll). */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
        <div className="space-y-1">
          <Label htmlFor={`${formId}-title`}>{t('todos.title_field')} *</Label>
          <Input
            id={`${formId}-title`}
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            // Fast create flow: focus the title on open, Enter submits.
            // In the auto-save drawer Enter just flushes the pending save
            // (immediately) instead of closing the slide-over.
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && formTitle.trim()) {
                e.preventDefault()
                void handleSave({ close: !autoSaveOn })
              }
            }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>{t('todos.description')}</Label>
            {formDesc.trim() && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDescPreview((p) => !p)}
              >
                {descPreview ? <PenLine className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {descPreview ? t('todos.descWrite') : t('todos.descPreview')}
              </button>
            )}
          </div>
          {descPreview ? (
            <div
              className="min-h-12 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
              onClick={() => setDescPreview(false)}
              title={t('todos.descWrite')}
            >
              <Markdown content={formDesc} />
            </div>
          ) : (
            <Textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              rows={2}
              placeholder={t('todos.descMarkdownHint')}
            />
          )}
        </div>
        {parentCandidates && (
          <div className="space-y-1">
            <Label>{t('todos.parent')}</Label>
            {/* Searchable combobox: filters the loaded candidates instantly and
                searches the whole workspace (title + description) once you
                type — finds parents beyond the current view's loaded pages. */}
            <TodoParentPicker
              value={formParentId}
              onChange={setFormParentId}
              candidates={parentCandidates}
              blocked={blockedParents}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>{t('labels.title')}</Label>
            <span className="text-xs text-muted-foreground">{t('labels.multiple')}</span>
          </div>
          <LabelPicker
            value={formTagIds}
            onChange={setFormTagIds}
            candidates={labelCandidates}
            disabled={saving}
            onPendingChange={setLabelCreating}
          />
        </div>
        <div className="space-y-1">
          <Label>{t('todos.status')}</Label>
          <div className="flex gap-1">
            {(['pending', 'done', 'abandoned'] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={formStatus === s ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs"
                aria-pressed={formStatus === s}
                onClick={() => setFormStatus(s)}
              >
                {t(`todos.${s}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <Label>{t('todos.priority')}</Label>
            <div className="flex gap-1">
              {(['none', 'low', 'normal', 'high'] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={formPriority === p ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  aria-pressed={formPriority === p}
                  onClick={() => setFormPriority(p)}
                >
                  {t(`todos.${p}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
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
        <div className="space-y-1">
          <Label className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />{t('todos.repeat')}</Label>
          <select
            value={formRepeat}
            onChange={(e) => setFormRepeat(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
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
        <div className="space-y-1">
          <Label>{t('todos.startTime')}</Label>
          <div className="flex gap-2">
            <Input type="datetime-local" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="flex-1" />
            {formStartTime && (
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setFormStartTime('')}>{t('todos.clear')}</Button>
            )}
          </div>
        </div>
        {/* Non-todo extras (finance amount, buddies, color) live behind a
            collapsible so the form stays focused on task fields; the badge
            hints at how many are set while collapsed. */}
        <div className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? '' : '-rotate-90'}`} />
            {t('todos.moreSettings')}
            {!moreOpen && extrasSet > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] leading-4">{extrasSet}</span>
            )}
          </button>
          {moreOpen && (
            <>
              {/* Estimated effort (持续时长): minutes with quick presets —
                  feeds planning and pairs naturally with pomodoro sessions. */}
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Hourglass className="h-3.5 w-3.5" />{t('todos.duration')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    placeholder="0"
                    className="h-8 w-20"
                    aria-label={t('todos.duration')}
                  />
                  <span className="text-xs text-muted-foreground">{t('todos.durationUnit')}</span>
                  <div className="flex gap-1">
                    {[15, 30, 60, 120].map((mins) => (
                      <Button
                        key={mins}
                        type="button"
                        variant={formDuration === String(mins) ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setFormDuration(String(mins))}
                      >
                        {mins < 60 ? `${mins}m` : mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`}
                      </Button>
                    ))}
                    {formDuration !== '' && (
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setFormDuration('')}>
                        {t('todos.clear')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('todos.amount')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
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
              <div className="space-y-1">
                <Label>{t('todos.buddy')}</Label>
                <BuddyPicker
                  buddies={contacts}
                  selectedIds={formContactIds}
                  onChange={setFormContactIds}
                  onBuddiesUpdate={onContactsChange}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('todos.color')}</Label>
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
            </>
          )}
        </div>
      </div>
      {saveError && !autoSaveOn && <p role="alert" className="mt-2 text-xs text-destructive">{t('todos.saveRetry')}</p>}
      {autoSaveOn ? (
        /* No buttons in auto-save mode: closing the shell is the X on the
           drawer, and everything else is already saving itself. */
        <div className="mt-3 flex min-h-9 items-center gap-2 border-t pt-3 text-xs text-muted-foreground" role="status">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('todos.autoSaving')}
            </>
          ) : saveError ? (
            <>
              <span className="text-destructive" role="alert">{t('todos.autoSaveFailed')}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => void handleSave({ close: false })}
              >
                {t('todos.autoSaveRetry')}
              </Button>
            </>
          ) : savedFlash ? (
            <>
              <Check className="h-3.5 w-3.5" />
              {t('todos.autoSaved')}
            </>
          ) : null}
        </div>
      ) : (
        <DialogFooter className="mt-3 border-t pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving || labelCreating}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleSave()} disabled={!formTitle.trim() || saving || labelCreating}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      )}
    </>
  )
}
