import { useEffect, useState, useMemo, memo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { contactsApi } from '../api/contacts'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Markdown } from '../components/Markdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import {
  Plus, Pencil, Trash2, Clock, CheckCircle2, Circle, ArrowRight, Loader2,
  ListChecks, AlignJustify, Columns, Repeat, Inbox, ChevronDown, Flag,
} from 'lucide-react'
import BuddyPicker from '../components/BuddyPicker'
import { toast } from 'sonner'
import type { Todo, Contact, Tag, TodoList, RepeatRule } from '../types'
import Pagination from '../components/Pagination'
import EmptyState from '../components/EmptyState'
import {
  useTodosList,
  useCreateTodo,
  useUpdateTodo,
  useToggleTodoStatus,
  useSyncTodoToEvent,
  useDeleteTodo,
  useTodoLists,
  useCreateTodoList,
  useDeleteTodoList,
  useCreateTodoItem,
  useToggleTodoItem,
  useDeleteTodoItem,
} from '../hooks/api/useTodos'
import { useTagsList } from '../hooks/api/useTags'

type TodoView = 'timeline' | 'grouped' | 'kanban'
type ListFilter = 'all' | 'inbox' | number

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

const REPEAT_OPTIONS: { value: RepeatRule; labelKey: string }[] = [
  { value: '', labelKey: 'todos.repeatNone' },
  { value: 'daily', labelKey: 'todos.repeatDaily' },
  { value: 'weekly', labelKey: 'todos.repeatWeekly' },
  { value: 'monthly', labelKey: 'todos.repeatMonthly' },
  { value: 'yearly', labelKey: 'todos.repeatYearly' },
  { value: 'weekdays', labelKey: 'todos.repeatWeekdays' },
]

const EMPTY_TODOS: Todo[] = []
const EMPTY_LISTS: TodoList[] = []
const EMPTY_TAGS: Tag[] = []

function isOverdue(todo: Todo): boolean {
  return todo.status === 'pending' && !!todo.due_time && new Date(todo.due_time).getTime() < Date.now()
}

/** In-tab reminder notifications for due/overdue pending todos. */
function useReminders(todos: Todo[]) {
  const hasNotif = typeof window !== 'undefined' && 'Notification' in window
  useEffect(() => {
    if (!hasNotif) return
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [hasNotif])

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const t of todos) {
        if (t.status !== 'pending' || !t.due_time) continue
        const due = new Date(t.due_time).getTime()
        const key = `todo_reminded_${t.id}_${due}`
        if (localStorage.getItem(key)) continue
        if (now >= due - 60_000) {
          localStorage.setItem(key, '1')
          const overdue = now > due + 60_000
          const msg = overdue ? `${t.title}（已逾期）` : `${t.title}（到点提醒）`
          if (hasNotif && Notification.permission === 'granted') {
            try {
              new Notification('CuddleGecko 待办', { body: msg })
            } catch {
              // ignore
            }
          }
          toast.info(msg)
        }
      }
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [todos, hasNotif])
}

interface TodoCardProps {
  todo: Todo
  compact?: boolean
  contactNames: string
  listName?: string
  onToggle: (id: number) => void
  onSync: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  formatDate: (dateStr: string | null) => string
  priorityLabel: string
  syncLabel: string
}

const TodoCard = memo(function TodoCard({
  todo, compact = false, contactNames, listName,
  onToggle, onSync, onEdit, onDelete, formatDate, priorityLabel, syncLabel,
}: TodoCardProps) {
  const { t } = useTranslation()
  const [showSubs, setShowSubs] = useState(false)
  const [newItem, setNewItem] = useState('')

  const createItem = useCreateTodoItem()
  const toggleItem = useToggleTodoItem()
  const deleteItem = useDeleteTodoItem()

  const items = todo.items ?? []
  const doneCount = items.filter((i) => i.done).length
  const overdue = isOverdue(todo)

  const handleAddItem = async () => {
    if (!newItem.trim()) return
    await createItem.mutateAsync({ todoId: todo.id, title: newItem.trim() })
    setNewItem('')
  }

  return (
    <Card
      className={`${todo.status === 'done' ? 'opacity-60' : ''} ${compact ? 'p-2' : ''} ${overdue ? 'ring-1 ring-red-400/60' : ''}`}
      style={todo.color ? { borderLeftColor: todo.color, borderLeftWidth: '3px' } : undefined}
    >
      <CardContent className={`${compact ? 'p-2 space-y-1' : 'p-3 space-y-2'}`}>
        <div className="flex items-start gap-2">
          <button
            onClick={() => onToggle(todo.id)}
            className="mt-0.5 shrink-0 cursor-pointer bg-transparent border-none"
          >
            {todo.status === 'done'
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <Circle className={`h-5 w-5 hover:text-primary ${overdue ? 'text-red-500' : 'text-muted-foreground'}`} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-sm font-medium ${todo.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                {todo.title}
              </span>
              {todo.repeat_rule && (
                <span title={t('todos.repeatRule')} className="text-muted-foreground inline-flex items-center">
                  <Repeat className="h-3 w-3" />
                </span>
              )}
              {overdue && (
                <Badge variant="outline" className="text-[10px] text-red-600 border-red-400 inline-flex items-center gap-0.5">
                  <Flag className="h-2.5 w-2.5" />{t('todos.overdue')}
                </Badge>
              )}
            </div>
            {todo.description && !compact && (
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3 prose-sm">
                <Markdown content={todo.description} />
              </div>
            )}
          </div>
          <Badge variant="secondary" className={`text-xs shrink-0 ${priorityConfig[todo.priority]?.bg || ''}`}>
            <span className={priorityConfig[todo.priority]?.color}>{priorityLabel}</span>
          </Badge>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {todo.due_time && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : ''}`}>
                <Clock className="h-3 w-3" />
                {formatDate(todo.due_time)}
              </span>
            )}
            {listName && (
              <span className="inline-flex items-center gap-1"><Inbox className="h-3 w-3" />{listName}</span>
            )}
            {todo.tags?.length > 0 && todo.tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-[10px]" style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}>
                {tag.name}
              </Badge>
            ))}
            {todo.amount != null && todo.amount > 0 && (
              <Badge variant="outline" className={todo.amount_type === 'income' ? 'text-green-600' : 'text-red-600'}>
                {todo.amount_type === 'income' ? '+' : '-'}{todo.amount}
              </Badge>
            )}
            {todo.contact_ids?.length > 0 && contactNames && (<span>{contactNames}</span>)}
            {items.length > 0 && (
              <button onClick={() => setShowSubs((v) => !v)} className="inline-flex items-center gap-0.5 hover:text-primary">
                <ChevronDown className={`h-3 w-3 transition-transform ${showSubs ? 'rotate-180' : ''}`} />
                {doneCount}/{items.length}
              </button>
            )}
          </div>
        )}

        {/* Inline sub-task editor */}
        {!compact && (showSubs || items.length > 0) && (
          <div className="space-y-1 pl-1">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-1.5 group">
                <button onClick={() => toggleItem.mutate({ todoId: todo.id, itemId: it.id })} className="bg-transparent border-none cursor-pointer">
                  {it.done
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <span className={`text-xs flex-1 ${it.done ? 'line-through text-muted-foreground' : ''}`}>{it.title}</span>
                <button onClick={() => deleteItem.mutate({ todoId: todo.id, itemId: it.id })} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <Plus className="h-3 w-3 text-muted-foreground" />
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem() }}
                placeholder={t('todos.addSubtask')}
                className="flex-1 text-xs bg-transparent outline-none border-b border-transparent focus:border-border"
              />
            </div>
          </div>
        )}

        {!compact && (
          <div className="flex items-center gap-1 pt-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onSync(todo)}>
              <ArrowRight className="h-3 w-3 mr-1" />
              {syncLabel}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onEdit(todo)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => onDelete(todo)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

export default function TodosPage() {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all')
  const [view, setView] = useState<TodoView>('grouped')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Todo | null>(null)
  const pageSize = 50
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null)
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [tagFilter, setTagFilter] = useState<number | undefined>(undefined)
  const [newListName, setNewListName] = useState('')
  const [showNewList, setShowNewList] = useState(false)

  const statusParam = statusFilter === 'all' ? undefined : statusFilter
  const listParam: string | undefined = listFilter === 'all' ? undefined : listFilter === 'inbox' ? 'inbox' : String(listFilter)
  const tagParam = tagFilter ? [tagFilter] : undefined

  const { data, isPending: loading } = useTodosList({ status: statusParam, list_id: listParam, tag_ids: tagParam, page, page_size: pageSize })
  const { data: lists } = useTodoLists()
  const { data: tagsData } = useTagsList(1, 100)
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const toggleTodo = useToggleTodoStatus()
  const syncTodo = useSyncTodoToEvent()
  const deleteTodo = useDeleteTodo()
  const createList = useCreateTodoList()
  const deleteList = useDeleteTodoList()

  const todos = data?.items ?? EMPTY_TODOS
  useReminders(todos)

  const total = data?.total ?? 0
  const listsArr = lists ?? EMPTY_LISTS
  const tagsArr = tagsData?.items ?? EMPTY_TAGS

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formPriority, setFormPriority] = useState<'low' | 'normal' | 'high'>('normal')
  const [formDueTime, setFormDueTime] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formAmountType, setFormAmountType] = useState<'' | 'income' | 'expense'>('')
  const [formContactIds, setFormContactIds] = useState<number[]>([])
  const [formColor, setFormColor] = useState('')
  const [formListId, setFormListId] = useState<number | null>(null)
  const [formRepeat, setFormRepeat] = useState<RepeatRule>('')
  const [formRepeatEvery, setFormRepeatEvery] = useState(1)
  const [formRepeatUntil, setFormRepeatUntil] = useState('')
  const [formTagIds, setFormTagIds] = useState<number[]>([])
  const [showMdPreview, setShowMdPreview] = useState(false)

  useEffect(() => {
    contactsApi.list({ page: 1, page_size: 100 }).then((res) => setContacts(res.data?.items ?? [])).catch(() => {})
  }, [])

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormPriority('normal'); setFormDueTime('')
    setFormAmount(''); setFormAmountType(''); setFormContactIds([]); setFormColor('')
    setFormListId(null); setFormRepeat(''); setFormRepeatEvery(1); setFormRepeatUntil('')
    setFormTagIds([]); setShowMdPreview(false)
    setEditing(null)
  }

  const openCreate = () => { resetForm(); setDialogOpen(true) }
  const openEdit = useCallback((todo: Todo) => {
    setEditing(todo)
    setFormTitle(todo.title)
    setFormDesc(todo.description)
    setFormPriority(todo.priority)
    setFormDueTime(todo.due_time ? todo.due_time.slice(0, 16) : '')
    setFormAmount(todo.amount != null ? String(todo.amount) : '')
    setFormAmountType(todo.amount_type || '')
    setFormContactIds(todo.contact_ids || [])
    setFormColor(todo.color || '')
    setFormListId(todo.list_id)
    setFormRepeat(todo.repeat_rule)
    setFormRepeatEvery(todo.repeat_every || 1)
    setFormRepeatUntil(todo.repeat_until ? todo.repeat_until.slice(0, 10) : '')
    setFormTagIds((todo.tags || []).map((tg) => tg.id))
    setShowMdPreview(false)
    setDialogOpen(true)
  }, [])

  const handleSave = async () => {
    if (!formTitle.trim()) return
    const payload: Partial<Todo> & { tag_ids?: number[] } = {
      title: formTitle.trim(),
      description: formDesc,
      priority: formPriority,
      due_time: formDueTime ? new Date(formDueTime).toISOString() : undefined,
      amount: formAmount ? parseFloat(formAmount) : undefined,
      amount_type: formAmountType,
      contact_ids: formContactIds,
      color: formColor,
      list_id: formListId,
      repeat_rule: formRepeat,
      repeat_every: formRepeat ? (formRepeatEvery || 1) : 0,
      repeat_until: formRepeat && formRepeatUntil ? new Date(formRepeatUntil).toISOString() : undefined,
      tag_ids: formTagIds,
    }
    if (editing) {
      await updateTodo.mutateAsync({ id: editing.id, data: payload })
    } else {
      await createTodo.mutateAsync(payload)
    }
    setDialogOpen(false)
    resetForm()
  }

  const handleToggle = useCallback(async (id: number) => {
    try { await toggleTodo.mutateAsync(id) } catch { /* ignore */ }
  }, [toggleTodo])

  const handleSync = useCallback(async (todo: Todo) => {
    try {
      await syncTodo.mutateAsync(todo.id)
      toast.success(t('todos.syncSuccess'))
    } catch {
      toast.error(t('todos.syncFailed'))
    }
  }, [t, syncTodo])

  const handleDelete = useCallback(async (id: number) => {
    try { await deleteTodo.mutateAsync(id); setConfirmDelete(null) } catch { /* ignore */ }
  }, [deleteTodo])

  const handleCreateList = async () => {
    if (!newListName.trim()) return
    await createList.mutateAsync({ name: newListName.trim() })
    setNewListName(''); setShowNewList(false)
  }

  const listNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const l of listsArr) m.set(l.id, l.name)
    return m
  }, [listsArr])

  const contactNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of contacts) m.set(c.id, c.name)
    return m
  }, [contacts])

  const getContactNames = useCallback((ids: number[]) =>
    ids.map((id) => contactNameMap.get(id)).filter(Boolean).join(', '),
    [contactNameMap])

  const formatDate = useCallback((dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }, [])

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr); const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }
  const isTomorrow = (dateStr: string) => {
    const d = new Date(dateStr); const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    return d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate()
  }
  const isThisWeek = (dateStr: string) => {
    const d = new Date(dateStr); const now = new Date(); const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay())); weekEnd.setHours(23, 59, 59)
    return d > new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) && d <= weekEnd
  }

  const { pendingTodos, doneTodos } = useMemo(() => {
    const pending: Todo[] = []
    const done: Todo[] = []
    for (const todo of todos) {
      if (todo.status === 'pending') pending.push(todo)
      else if (todo.status === 'done') done.push(todo)
    }
    return { pendingTodos: pending, doneTodos: done }
  }, [todos])

  const groupedTodos = useMemo(() => {
    const overdueGroup: Todo[] = []
    const groups: { key: string; label: string; items: Todo[] }[] = [
      { key: 'overdue', label: t('todos.overdue'), items: overdueGroup },
      { key: 'today', label: t('todos.today'), items: [] },
      { key: 'tomorrow', label: t('todos.tomorrow'), items: [] },
      { key: 'thisWeek', label: t('todos.thisWeek'), items: [] },
      { key: 'later', label: t('todos.later'), items: [] },
      { key: 'noDue', label: t('todos.noDueDate'), items: [] },
    ]
    for (const todo of pendingTodos) {
      if (!todo.due_time) { groups[5].items.push(todo); continue }
      if (isOverdue(todo)) { groups[0].items.push(todo); continue }
      if (isToday(todo.due_time)) { groups[1].items.push(todo); continue }
      if (isTomorrow(todo.due_time)) { groups[2].items.push(todo); continue }
      if (isThisWeek(todo.due_time)) { groups[3].items.push(todo); continue }
      groups[4].items.push(todo)
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

  const syncLabel = t('todos.syncToEvent')

  const renderTodoCard = (todo: Todo, compact = false) => (
    <TodoCard
      key={todo.id}
      todo={todo}
      compact={compact}
      contactNames={getContactNames(todo.contact_ids || [])}
      listName={todo.list_id ? listNameMap.get(todo.list_id) : undefined}
      priorityLabel={t(`todos.${todo.priority}`)}
      syncLabel={syncLabel}
      onToggle={handleToggle}
      onSync={handleSync}
      onEdit={openEdit}
      onDelete={setConfirmDelete}
      formatDate={formatDate}
    />
  )

  return (
    <div className="flex gap-4">
      {/* Sidebar: lists + tags */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 gap-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{t('todos.sidebarLists')}</div>
          <div className="space-y-0.5">
            <FilterRow active={listFilter === 'all' && tagFilter === undefined} onClick={() => { setListFilter('all'); setTagFilter(undefined); setPage(1) }} icon={<ListChecks className="h-3.5 w-3.5" />} label={t('todos.all')} />
            <FilterRow active={listFilter === 'inbox'} onClick={() => { setListFilter('inbox'); setTagFilter(undefined); setPage(1) }} icon={<Inbox className="h-3.5 w-3.5" />} label={t('todos.inbox')} />
            {listsArr.map((l) => (
              <FilterRow
                key={l.id}
                active={listFilter === l.id}
                onClick={() => { setListFilter(l.id); setTagFilter(undefined); setPage(1) }}
                icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color || '#9ca3af' }} />}
                label={l.name}
                onDelete={l.id ? () => deleteList.mutate(l.id) : undefined}
              />
            ))}
          </div>
          {showNewList ? (
            <div className="mt-1.5 flex gap-1">
              <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateList() }} placeholder={t('todos.listName')} className="h-7 text-xs" />
              <Button size="sm" className="h-7 px-2" onClick={handleCreateList}><Plus className="h-3 w-3" /></Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2 mt-1 text-xs text-muted-foreground" onClick={() => setShowNewList(true)}>
              <Plus className="h-3 w-3 mr-1" />{t('todos.newList')}
            </Button>
          )}
        </div>

        {tagsArr.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{t('todos.sidebarTags')}</div>
            <div className="flex flex-wrap gap-1">
              {tagsArr.map((tg) => (
                <button
                  key={tg.id}
                  onClick={() => { setTagFilter(tagFilter === tg.id ? undefined : tg.id); setPage(1) }}
                  className={`text-[11px] px-1.5 py-0.5 rounded border ${tagFilter === tg.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                  style={tagFilter === tg.id ? undefined : (tg.color ? { color: tg.color, borderColor: tg.color } : undefined)}
                >
                  {tg.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('todos.title')}</h1>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md overflow-hidden">
              {(['all', 'pending', 'done'] as const).map((s) => (
                <Button key={s} variant={statusFilter === s ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs rounded-none" onClick={() => { setStatusFilter(s); setPage(1) }}>
                  {t(`todos.${s}`)}
                </Button>
              ))}
            </div>
            <div className="flex border rounded-md overflow-hidden">
              {viewButtons.map(({ key, icon: Icon, label }) => (
                <Button key={key} variant={view === key ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0 rounded-none" onClick={() => setView(key)} title={label}>
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />{t('todos.newTodo')}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : todos.length === 0 ? (
          <EmptyState message={t('todos.noTodos')} />
        ) : view === 'timeline' ? (
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-6">
              {timelineGroups.map(({ date, items }) => (
                <div key={date}>
                  <div className="relative flex items-center gap-2 mb-3">
                    <div className="absolute -left-[18px] w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <span className="text-sm font-medium text-muted-foreground">{date}</span>
                  </div>
                  <div className="space-y-2 ml-2">{items.map((todo) => renderTodoCard(todo))}</div>
                </div>
              ))}
            </div>
          </div>
        ) : view === 'grouped' ? (
          <div className="space-y-6">
            {groupedTodos.filter((g) => g.items.length > 0).map((group) => (
              <div key={group.key}>
                <h3 className={`text-sm font-medium mb-2 ${group.key === 'overdue' ? 'text-red-600' : 'text-muted-foreground'}`}>{group.label}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.items.map((todo) => renderTodoCard(todo))}</div>
              </div>
            ))}
            {doneTodos.length > 0 && statusFilter !== 'pending' && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('todos.completed')} ({doneTodos.length})</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{doneTodos.map((todo) => renderTodoCard(todo))}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><Circle className="h-4 w-4 text-muted-foreground" />{t('todos.pending')} ({pendingTodos.length})</h3>
              <div className="space-y-2 min-h-[200px] bg-muted/30 rounded-lg p-3">
                {pendingTodos.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p> : pendingTodos.map((todo) => renderTodoCard(todo, true))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />{t('todos.done')} ({doneTodos.length})</h3>
              <div className="space-y-2 min-h-[200px] bg-muted/30 rounded-lg p-3">
                {doneTodos.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p> : doneTodos.map((todo) => renderTodoCard(todo, true))}
              </div>
            </div>
          </div>
        )}

        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? t('todos.editTodo') : t('todos.newTodo')}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>{t('todos.title_field')} *</Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t('todos.description')}</Label>
                  <button type="button" onClick={() => setShowMdPreview((v) => !v)} className="text-xs text-primary hover:underline">
                    {showMdPreview ? t('todos.mdEdit') : t('todos.mdPreview')}
                  </button>
                </div>
                {showMdPreview ? (
                  <div className="min-h-[60px] rounded-md border border-border p-2 text-sm"><Markdown content={formDesc || `*${t('todos.mdEmpty')}*`} /></div>
                ) : (
                  <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={3} placeholder={t('todos.descPlaceholder')} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('todos.priority')}</Label>
                  <div className="flex gap-1">
                    {(['low', 'normal', 'high'] as const).map((p) => (
                      <Button key={p} type="button" variant={formPriority === p ? 'default' : 'outline'} size="sm" className="flex-1 text-xs" onClick={() => setFormPriority(p)}>
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

              <div className="space-y-1.5">
                <Label>{t('todos.listField')}</Label>
                <select
                  value={formListId ?? ''}
                  onChange={(e) => setFormListId(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-transparent px-2 text-sm"
                >
                  <option value="">{t('todos.inbox')}</option>
                  {listsArr.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('todos.repeatRule')}</Label>
                <div className="flex flex-wrap gap-1">
                  {REPEAT_OPTIONS.map((r) => (
                    <Button key={r.value} type="button" variant={formRepeat === r.value ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setFormRepeat(r.value)}>
                      {t(r.labelKey)}
                    </Button>
                  ))}
                </div>
                {formRepeat && formRepeat !== 'weekdays' && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground">{t('todos.repeatEvery')}</span>
                    <Input type="number" min={1} value={formRepeatEvery} onChange={(e) => setFormRepeatEvery(Number(e.target.value) || 1)} className="h-7 w-16 text-xs" />
                    <span className="text-xs text-muted-foreground">{t(`todos.repeatUnit_${formRepeat}`)}</span>
                    <Input type="date" value={formRepeatUntil} onChange={(e) => setFormRepeatUntil(e.target.value)} className="h-7 w-auto text-xs" title={t('todos.repeatUntil')} />
                  </div>
                )}
              </div>

              {tagsArr.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t('todos.tagsField')}</Label>
                  <div className="flex flex-wrap gap-1">
                    {tagsArr.map((tg) => {
                      const on = formTagIds.includes(tg.id)
                      return (
                        <button key={tg.id} type="button" onClick={() => setFormTagIds((cur) => on ? cur.filter((x) => x !== tg.id) : [...cur, tg.id])}
                          className={`text-xs px-1.5 py-0.5 rounded border ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                          style={on ? undefined : (tg.color ? { color: tg.color, borderColor: tg.color } : undefined)}>
                          {tg.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('todos.amount')}</Label>
                  <Input type="number" step="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('todos.amountType')}</Label>
                  <div className="flex gap-1">
                    {(['', 'income', 'expense'] as const).map((at) => (
                      <Button key={at} type="button" variant={formAmountType === at ? 'default' : 'outline'} size="sm" className="flex-1 text-xs" onClick={() => setFormAmountType(at)}>
                        {at === '' ? '-' : t(`todos.${at}`)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('todos.buddy')}</Label>
                <BuddyPicker buddies={contacts} selectedIds={formContactIds} onChange={setFormContactIds} onBuddiesUpdate={setContacts} />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button key={c.value} type="button" onClick={() => setFormColor(c.value)}
                      className={`h-6 w-6 rounded-full border-2 transition-colors ${formColor === c.value ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value || 'transparent', backgroundImage: c.value ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                      title={c.label} />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={!formTitle.trim() || createTodo.isPending || updateTodo.isPending}>
                {(createTodo.isPending || updateTodo.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>{t('todos.deleteConfirm')}</DialogTitle></DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
              <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete.id)}>
                {t('todos.deleteConfirm').split('?')[0] || t('common.cancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function FilterRow({ active, onClick, icon, label, onDelete }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  onDelete?: () => void
}) {
  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1 rounded-md text-sm cursor-pointer ${active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`} onClick={onClick}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
