import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { todoApi } from '../api/todo'
import { contactsApi } from '../api/contacts'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { Plus, Pencil, Trash2, Clock, CheckCircle2, Circle, ArrowRight, Loader2, ListChecks, AlignJustify, Columns } from 'lucide-react'
import BuddyPicker from '../components/BuddyPicker'
import type { Todo, Contact } from '../types'

type TodoView = 'timeline' | 'grouped' | 'kanban'

const COLORS = [
  { value: '', label: 'Default' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
]

const priorityConfig: Record<string, { color: string; bg: string }> = {
  high: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  normal: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  low: { color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
}

export default function TodosPage() {
  const { t } = useTranslation()
  const [todos, setTodos] = useState<Todo[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all')
  const [view, setView] = useState<TodoView>('grouped')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Todo | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formPriority, setFormPriority] = useState<'low' | 'normal' | 'high'>('normal')
  const [formDueTime, setFormDueTime] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formAmountType, setFormAmountType] = useState<'' | 'income' | 'expense'>('')
  const [formContactIds, setFormContactIds] = useState<number[]>([])
  const [formColor, setFormColor] = useState('')

  const loadTodos = async () => {
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter
      const res = await todoApi.list(status)
      setTodos(res.data ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const loadContacts = async () => {
    try {
      const res = await contactsApi.list({ page: 1, page_size: 100 })
      setContacts(res.data?.items ?? [])
    } catch {
      // ignore
    }
  }

  useEffect(() => { loadTodos() }, [statusFilter])
  useEffect(() => { loadContacts() }, [])

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormPriority('normal'); setFormDueTime('')
    setFormAmount(''); setFormAmountType(''); setFormContactIds([]); setFormColor('')
    setEditing(null)
  }

  const openCreate = () => { resetForm(); setDialogOpen(true) }
  const openEdit = (todo: Todo) => {
    setEditing(todo)
    setFormTitle(todo.title)
    setFormDesc(todo.description)
    setFormPriority(todo.priority)
    setFormDueTime(todo.due_time ? todo.due_time.slice(0, 16) : '')
    setFormAmount(todo.amount != null ? String(todo.amount) : '')
    setFormAmountType(todo.amount_type || '')
    setFormContactIds(todo.contact_ids || [])
    setFormColor(todo.color || '')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      const data: Partial<Todo> = {
        title: formTitle.trim(),
        description: formDesc,
        priority: formPriority,
        due_time: formDueTime ? new Date(formDueTime).toISOString() : undefined,
        amount: formAmount ? parseFloat(formAmount) : undefined,
        amount_type: formAmountType,
        contact_ids: formContactIds,
        color: formColor,
      }
      if (editing) {
        await todoApi.update(editing.id, data)
      } else {
        await todoApi.create(data)
      }
      setDialogOpen(false)
      resetForm()
      loadTodos()
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: number) => {
    try {
      await todoApi.toggleStatus(id)
      loadTodos()
    } catch {
      // ignore
    }
  }

  const handleSync = async (todo: Todo) => {
    try {
      await todoApi.syncToEvent(todo.id)
      alert(t('todos.syncSuccess'))
    } catch {
      alert(t('todos.syncFailed'))
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await todoApi.delete(id)
      setConfirmDelete(null)
      loadTodos()
    } catch {
      // ignore
    }
  }

  const getContactNames = (ids: number[]) =>
    ids.map((id) => contacts.find((c) => c.id === id)?.name).filter(Boolean).join(', ')

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }

  const isTomorrow = (dateStr: string) => {
    const d = new Date(dateStr)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate()
  }

  const isThisWeek = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
    weekEnd.setHours(23, 59, 59)
    return d > new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) && d <= weekEnd
  }

  // Group todos by date for timeline/grouped views
  const pendingTodos = todos.filter((t) => t.status === 'pending')
  const doneTodos = todos.filter((t) => t.status === 'done')

  const groupedTodos = useMemo(() => {
    const groups: { key: string; label: string; items: Todo[] }[] = [
      { key: 'today', label: t('todos.today'), items: [] },
      { key: 'tomorrow', label: t('todos.tomorrow'), items: [] },
      { key: 'thisWeek', label: t('todos.thisWeek'), items: [] },
      { key: 'later', label: t('todos.later'), items: [] },
      { key: 'noDue', label: t('todos.noDueDate'), items: [] },
    ]
    for (const todo of pendingTodos) {
      if (!todo.due_time) { groups[4].items.push(todo); continue }
      if (isToday(todo.due_time)) { groups[0].items.push(todo); continue }
      if (isTomorrow(todo.due_time)) { groups[1].items.push(todo); continue }
      if (isThisWeek(todo.due_time)) { groups[2].items.push(todo); continue }
      groups[3].items.push(todo)
    }
    return groups
  }, [pendingTodos, t])

  const timelineGroups = useMemo(() => {
    const map = new Map<string, Todo[]>()
    for (const todo of todos) {
      const key = todo.due_time ? formatDay(todo.due_time) : t('todos.noDueDate')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(todo)
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
  }, [todos, t])

  const viewButtons: { key: TodoView; icon: typeof ListChecks; label: string }[] = [
    { key: 'timeline', icon: AlignJustify, label: t('todos.viewTimeline') },
    { key: 'grouped', icon: ListChecks, label: t('todos.viewGrouped') },
    { key: 'kanban', icon: Columns, label: t('todos.viewKanban') },
  ]

  const renderTodoCard = (todo: Todo, compact = false) => (
    <Card
      key={todo.id}
      className={`${todo.status === 'done' ? 'opacity-60' : ''} ${compact ? 'p-2' : ''}`}
      style={todo.color ? { borderLeftColor: todo.color, borderLeftWidth: '3px' } : undefined}
    >
      <CardContent className={`${compact ? 'p-2 space-y-1' : 'p-3 space-y-2'}`}>
        <div className="flex items-start gap-2">
          <button
            onClick={() => handleToggle(todo.id)}
            className="mt-0.5 shrink-0 cursor-pointer bg-transparent border-none"
          >
            {todo.status === 'done'
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />}
          </button>
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-medium ${todo.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
              {todo.title}
            </span>
            {todo.description && !compact && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{todo.description}</p>
            )}
          </div>
          <Badge variant="secondary" className={`text-xs shrink-0 ${priorityConfig[todo.priority]?.bg || ''}`}>
            <span className={priorityConfig[todo.priority]?.color}>{t(`todos.${todo.priority}`)}</span>
          </Badge>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {todo.due_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(todo.due_time)}
              </span>
            )}
            {todo.amount != null && todo.amount > 0 && (
              <Badge variant="outline" className={todo.amount_type === 'income' ? 'text-green-600' : 'text-red-600'}>
                {todo.amount_type === 'income' ? '+' : '-'}{todo.amount}
              </Badge>
            )}
            {todo.contact_ids?.length > 0 && (
              <span>{getContactNames(todo.contact_ids)}</span>
            )}
          </div>
        )}

        {!compact && (
          <div className="flex items-center gap-1 pt-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleSync(todo)}>
              <ArrowRight className="h-3 w-3 mr-1" />
              {t('todos.syncToEvent')}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => openEdit(todo)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => setConfirmDelete(todo)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('todos.title')}</h1>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex border rounded-md overflow-hidden">
            {(['all', 'pending', 'done'] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs rounded-none"
                onClick={() => setStatusFilter(s)}
              >
                {t(`todos.${s}`)}
              </Button>
            ))}
          </div>
          {/* View toggle */}
          <div className="flex border rounded-md overflow-hidden">
            {viewButtons.map(({ key, icon: Icon, label }) => (
              <Button
                key={key}
                variant={view === key ? 'default' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0 rounded-none"
                onClick={() => setView(key)}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('todos.newTodo')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : todos.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('todos.noTodos')}</p>
      ) : view === 'timeline' ? (
        /* Timeline View */
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-6">
            {timelineGroups.map(({ date, items }) => (
              <div key={date}>
                <div className="relative flex items-center gap-2 mb-3">
                  <div className="absolute -left-[18px] w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  <span className="text-sm font-medium text-muted-foreground">{date}</span>
                </div>
                <div className="space-y-2 ml-2">
                  {items.map((todo) => renderTodoCard(todo))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : view === 'grouped' ? (
        /* Date-grouped View */
        <div className="space-y-6">
          {groupedTodos.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.key}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{group.label}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          ))}
          {doneTodos.length > 0 && statusFilter !== 'pending' && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('todos.completed')} ({doneTodos.length})</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {doneTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kanban View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Circle className="h-4 w-4 text-muted-foreground" />
              {t('todos.pending')} ({pendingTodos.length})
            </h3>
            <div className="space-y-2 min-h-[200px] bg-muted/30 rounded-lg p-3">
              {pendingTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p>
              ) : (
                pendingTodos.map((todo) => renderTodoCard(todo, true))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {t('todos.done')} ({doneTodos.length})
            </h3>
            <div className="space-y-2 min-h-[200px] bg-muted/30 rounded-lg p-3">
              {doneTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p>
              ) : (
                doneTodos.map((todo) => renderTodoCard(todo, true))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('todos.editTodo') : t('todos.newTodo')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('todos.title_field')} *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('todos.description')}</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} />
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
                onBuddiesUpdate={setContacts}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!formTitle.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('todos.deleteConfirm')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete.id)}>
              {t('todos.deleteConfirm').split('?')[0] || t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
