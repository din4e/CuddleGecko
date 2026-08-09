import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { contactsApi } from '../api/contacts'
import { todosApi } from '../api/todos'
import { tagsApi } from '../api/tags'
import { parseQuickAdd } from '../lib/quickAdd'
import { buildICS } from '../lib/ics'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { Plus, Trash2, CheckCircle2, Circle, Loader2, ListChecks, AlignJustify, Columns, Search, ArrowDownUp, X, ChevronUp, ChevronDown, Keyboard, CheckSquare, Download, ListTree } from 'lucide-react'
import { toast } from 'sonner'
import type { Todo, Contact, Tag, TodoSort, TodoListParams } from '../types'
import Pagination from '../components/Pagination'
import EmptyState from '../components/EmptyState'
import TodoCard from '../components/TodoCard'
import TodoTree from '../components/TodoTreeRow'
import { buildTodoTree } from '../lib/buildTodoTree'
import { TodoFormDialog } from '../components/TodoFormDialog'
import {
  useTodosList,
  useCreateTodo,
  useUpdateTodo,
  useToggleTodoStatus,
  useReorderTodo,
  useMoveTodo,
  useTogglePin,
  useSyncTodoToEvent,
  useDuplicateTodo,
  useDeleteTodo,
  useBulkActionTodo,
  useTodoStats,
  useTodoTrash,
  useRestoreTodo,
  useReplaceTodoTags,
} from '../hooks/api/useTodos'

type TodoView = 'timeline' | 'grouped' | 'kanban' | 'tree'

// TickTick-style smart lists. Each maps to a set of backend list params.
type SmartList = 'all' | 'today' | 'next7' | 'overdue' | 'pending' | 'completed' | 'trash'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function smartListParams(list: SmartList): TodoListParams {
  const todayStart = startOfDay(new Date())
  switch (list) {
    case 'today':
      // TickTick's "Today" shows tasks due today AND anything overdue, but not deferred ones.
      return { status: 'pending', started: true, due_before: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString() }
    case 'next7':
      return { status: 'pending', due_after: todayStart.toISOString(), due_before: new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() }
    case 'overdue':
      return { overdue: true, started: true }
    case 'pending':
      return { status: 'pending', started: true }
    case 'completed':
      return { status: 'done' }
    case 'trash':
      return {} // trash uses a separate fetch; these params are unused
    default:
      return {}
  }
}


export default function TodosPage() {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [smartList, setSmartList] = useState<SmartList>('all')
  const [quickTitle, setQuickTitle] = useState('')
  const [quickDue, setQuickDue] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'' | 'low' | 'normal' | 'high'>('')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<TodoSort>('due_date')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [view, setView] = useState<TodoView>(
    () => (localStorage.getItem('todoView') as TodoView) || 'grouped',
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Todo | null>(null)
  // When creating via "add child" in the tree, this presets the new todo's parent.
  const [presetParent, setPresetParent] = useState<Todo | null>(null)
  const pageSize = 50
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // Tree-view collapse state: ids in the set are collapsed (default: all expanded).
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem('todoTreeCollapsed')
      return raw ? new Set<number>(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })
  const searchRef = useRef<HTMLInputElement>(null)

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Persist the chosen view mode + tree collapse state across reloads.
  useEffect(() => {
    localStorage.setItem('todoView', view)
  }, [view])
  useEffect(() => {
    localStorage.setItem('todoTreeCollapsed', JSON.stringify([...collapsed]))
  }, [collapsed])

  const listParams: TodoListParams = {
    ...smartListParams(smartList),
    priority: priorityFilter || undefined,
    tag_id: tagFilter ? Number(tagFilter) : undefined,
    q: q || undefined,
    sort,
    order,
    page: view === 'tree' ? 1 : page,
    page_size: view === 'tree' ? 1000 : pageSize,
  }
  const { data, isPending: loading } = useTodosList(listParams)
  const { data: stats } = useTodoStats()
  const { data: trashTodos } = useTodoTrash(smartList === 'trash')
  const restoreTodo = useRestoreTodo()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const toggleTodo = useToggleTodoStatus()
  const reorderTodo = useReorderTodo()
  const moveTodo = useMoveTodo()
  const pinTodo = useTogglePin()
  const syncTodo = useSyncTodoToEvent()
  const duplicateTodo = useDuplicateTodo()
  const deleteTodo = useDeleteTodo()
  const bulkTodo = useBulkActionTodo()

  // Bulk selection state.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const replaceTags = useReplaceTodoTags()

  const todos = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0

  useEffect(() => {
    contactsApi.list({ page: 1, page_size: 100 }).then((res) => setContacts(res.data?.items ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    tagsApi.list(1, 200).then((res) => setTags(res.data?.items ?? [])).catch(() => {})
  }, [])

  const openCreate = useCallback(() => { setEditing(null); setPresetParent(null); setDialogOpen(true) }, [])
  const openCreateChild = useCallback((parent: Todo) => { setEditing(null); setPresetParent(parent); setDialogOpen(true) }, [])

  // Global keyboard shortcuts. Ignored while typing in a field or when a
  // dialog is open so they never hijack text entry.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (dialogOpen || confirmDelete || shortcutsOpen) return
      switch (e.key) {
        case 'n': case 'N':
          e.preventDefault(); openCreate(); break
        case '/':
          e.preventDefault(); searchRef.current?.focus(); break
        case '1': setView('timeline'); break
        case '2': setView('grouped'); break
        case '3': setView('kanban'); break
        case '4': setView('tree'); break
        case '?': setShortcutsOpen(true); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, confirmDelete, shortcutsOpen, openCreate])

  const openEdit = useCallback((todo: Todo) => {
    setEditing(todo)
    setPresetParent(null)
    setDialogOpen(true)
  }, [])

  const handleQuickAdd = async () => {
    const raw = quickTitle.trim()
    if (!raw) return
    // Natural-language parse: the manual datetime picker wins if set, otherwise
    // a date/time detected in the text is used.
    const parsed = parseQuickAdd(raw)
    if (!parsed.title) return
    const dueISO = quickDue
      ? new Date(quickDue).toISOString()
      : parsed.due
        ? parsed.due.toISOString()
        : undefined
    try {
      const created = await createTodo.mutateAsync({ title: parsed.title, due_time: dueISO, priority: parsed.priority })
      // Resolve any #tag tokens to existing workspace tags and assign them.
      const todoId = created?.data?.id
      if (todoId != null && parsed.tags.length > 0) {
        const tagIds = parsed.tags
          .map((name) => tags.find((tg) => tg.name.toLowerCase() === name.toLowerCase())?.id)
          .filter((id): id is number => id != null)
        if (tagIds.length > 0) {
          try {
            await replaceTags.mutateAsync({ todoId, tagIds })
          } catch {
            // tag assignment is non-fatal
          }
        }
      }
      setQuickTitle('')
      setQuickDue('')
    } catch {
      toast.error(t('todos.createFailed'))
    }
  }

  const handleToggle = useCallback(async (id: number) => {
    try {
      const res = await toggleTodo.mutateAsync(id)
      // A recurring task that is still pending after toggling was advanced to
      // its next occurrence rather than completed.
      if (res?.data?.repeat && res.data.status === 'pending') {
        toast.info(t('todos.recurringAdvanced'))
      }
    } catch {
      // ignore
    }
  }, [toggleTodo, t])

  const handleTogglePin = useCallback(async (todo: Todo) => {
    try {
      await pinTodo.mutateAsync(todo.id)
    } catch {
      // ignore
    }
  }, [pinTodo])

  const handleRestore = useCallback(async (id: number) => {
    try {
      await restoreTodo.mutateAsync(id)
      toast.success(t('todos.restored'))
    } catch {
      toast.error(t('todos.restoreFailed'))
    }
  }, [restoreTodo, t])

  // Export pending todos with due times as an iCalendar (.ics) download.
  const handleExportICS = useCallback(async () => {
    try {
      const res = await todosApi.list({ status: 'pending', page: 1, page_size: 100000 })
      const ics = buildICS(res.data?.items ?? [])
      const blob = new Blob([ics], { type: 'text/calendar' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cuddlegecko-todos.ics'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('todos.exportIcsFailed'))
    }
  }, [t])

  // Kanban: dropping a card on the opposite-status column toggles it.
  const handleColumnDrop = (targetStatus: 'pending' | 'done') => {
    const id = dragId
    setDragId(null)
    if (id == null) return
    const todo = todos.find((it) => it.id === id)
    if (todo && todo.status !== targetStatus) handleToggle(id)
  }

  // Inline rename: the backend Update overwrites scalar fields, so we resend the
  // full payload with only the title changed to avoid wiping other fields.
  const handleRename = useCallback(async (id: number, title: string) => {
    const todo = todos.find((it) => it.id === id)
    if (!todo) return
    try {
      await updateTodo.mutateAsync({
        id,
        data: {
          title,
          description: todo.description,
          priority: todo.priority,
          status: todo.status,
          due_time: todo.due_time,
          amount: todo.amount,
          amount_type: todo.amount_type,
          contact_ids: todo.contact_ids,
          color: todo.color,
          repeat: todo.repeat,
        },
      })
    } catch {
      toast.error(t('todos.renameFailed'))
    }
  }, [todos, updateTodo, t])

  const handleSync = useCallback(async (todo: Todo) => {
    try {
      await syncTodo.mutateAsync(todo.id)
      toast.success(t('todos.syncSuccess'))
    } catch {
      toast.error(t('todos.syncFailed'))
    }
  }, [t, syncTodo])

  const handleDuplicate = useCallback(async (todo: Todo) => {
    try {
      await duplicateTodo.mutateAsync(todo.id)
      toast.success(t('todos.duplicated'))
    } catch {
      toast.error(t('todos.duplicateFailed'))
    }
  }, [t, duplicateTodo])

  // --- Bulk selection ---
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  const exitSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }
  const runBulk = async (action: 'complete' | 'delete', successKey: string) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      await bulkTodo.mutateAsync({ ids, action })
      toast.success(t(successKey, { n: ids.length }))
      exitSelection()
    } catch {
      toast.error(t('todos.bulkFailed'))
    }
  }

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteTodo.mutateAsync(id)
      setConfirmDelete(null)
    } catch {
      // ignore
    }
  }, [deleteTodo])

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

  // Manual reordering (only meaningful when sort === 'manual'). Positions are
  // expressed as "move to right after afterId" (or to the top when null),
  // computed from the currently displayed pending order.
  const handleMove = async (id: number, afterId: number | null) => {
    try {
      await reorderTodo.mutateAsync({ id, afterId })
    } catch {
      toast.error(t('todos.reorderFailed'))
    }
  }
  const handleMoveUp = (i: number) => {
    if (i <= 0) return
    handleMove(pendingTodos[i].id, i >= 2 ? pendingTodos[i - 2].id : null)
  }
  const handleMoveDown = (i: number) => {
    if (i >= pendingTodos.length - 1) return
    handleMove(pendingTodos[i].id, pendingTodos[i + 1].id)
  }

  // Tree-view reparenting: indent/outdent/up/down all reduce to a single move
  // call (parent_id + place-after sibling).
  const handleTreeMove = async (id: number, parentId: number | null, afterId: number | null) => {
    try {
      await moveTodo.mutateAsync({ id, parentId, afterId })
    } catch {
      toast.error(t('todos.reorderFailed'))
    }
  }
  const toggleCollapse = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const todoTree = useMemo(() => buildTodoTree(todos), [todos])
  // id → title for the "nested under <parent>" hint on cards in non-tree views.
  const todoTitleById = useMemo(() => new Map(todos.map((t) => [t.id, t.title])), [todos])

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
    { key: 'tree', icon: ListTree, label: t('todos.viewTree') },
  ]

  const renderTodoCard = (todo: Todo, compact = false) => (
    <TodoCard
      key={todo.id}
      todo={todo}
      compact={compact}
      selectable={selectionMode}
      selected={selectedIds.has(todo.id)}
      onSelectToggle={toggleSelect}
      contactNames={getContactNames(todo.contact_ids || [])}
      onToggle={handleToggle}
      onTogglePin={handleTogglePin}
      onSync={handleSync}
      onEdit={openEdit}
      onRename={handleRename}
      onDuplicate={handleDuplicate}
      onDelete={setConfirmDelete}
      formatDate={formatDate}
      parentTitle={todo.parent_id ? todoTitleById.get(todo.parent_id) : undefined}
    />
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('todos.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant={selectionMode ? 'default' : 'outline'} size="sm" className="h-7 px-2.5 text-xs" onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}>
            <CheckSquare className="h-4 w-4 mr-1" />
            {selectionMode ? t('common.cancel') : t('todos.select')}
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setShortcutsOpen(true)} title={t('todos.shortcuts')}>
            <Keyboard className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={handleExportICS} title={t('todos.exportIcs')}>
            <Download className="h-4 w-4" />
          </Button>
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

      {/* Productivity overview */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">{t('todos.statPending')}</div>
            <div className="text-lg font-semibold">{stats.pending}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">{t('todos.statOverdue')}</div>
            <div className={`text-lg font-semibold ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{stats.overdue}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">{t('todos.statDeferred')}</div>
            <div className={`text-lg font-semibold ${stats.deferred > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{stats.deferred}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">{t('todos.statDoneToday')}</div>
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">{stats.done_today}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xs text-muted-foreground">{t('todos.statDoneThisWeek')}</div>
            <div className="text-lg font-semibold">{stats.done_this_week}</div>
          </div>
        </div>
      )}

      {/* Quick add bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder={t('todos.quickAdd')}
            className="h-9 pl-8"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd() } }}
          />
        </div>
        <Input
          type="datetime-local"
          value={quickDue}
          onChange={(e) => setQuickDue(e.target.value)}
          className="h-9 w-44"
          aria-label={t('todos.dueTime')}
        />
        <Button size="sm" onClick={handleQuickAdd} disabled={!quickTitle.trim() || createTodo.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {t('common.create')}
        </Button>
      </div>

      {/* Smart-list switcher */}
      <div className="flex flex-wrap border rounded-md overflow-hidden w-fit">
        {(['all', 'today', 'next7', 'overdue', 'pending', 'completed', 'trash'] as SmartList[]).map((s) => (
          <Button
            key={s}
            variant={smartList === s ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 text-xs rounded-none"
            onClick={() => { setSmartList(s); setPage(1) }}
          >
            {t(`todos.${s === 'next7' ? 'next7' : s}`)}
          </Button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectionMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
          <span className="text-sm text-muted-foreground">{t('todos.selectionCount', { n: selectedIds.size })}</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || bulkTodo.isPending} onClick={() => runBulk('complete', 'todos.bulkCompleted')}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {t('todos.bulkComplete')}
          </Button>
          <Button size="sm" variant="destructive" disabled={selectedIds.size === 0 || bulkTodo.isPending} onClick={() => runBulk('delete', 'todos.bulkDeleted')}>
            <Trash2 className="h-4 w-4 mr-1" />
            {t('todos.bulkDelete')}
          </Button>
          <Button size="sm" variant="ghost" onClick={exitSelection}>{t('common.cancel')}</Button>
        </div>
      )}

      {/* Filter / search / sort toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('todos.searchPlaceholder')}
            className="h-8 pl-8 pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t('todos.clearSearch')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value as typeof priorityFilter); setPage(1) }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label={t('todos.priority')}
        >
          <option value="">{t('todos.allPriorities')}</option>
          <option value="high">{t('todos.high')}</option>
          <option value="normal">{t('todos.normal')}</option>
          <option value="low">{t('todos.low')}</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); setPage(1) }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label={t('todos.tags')}
        >
          <option value="">{t('todos.allTags')}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={String(tag.id)}>{tag.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as TodoSort); setPage(1) }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label={t('todos.sort')}
        >
          <option value="due_date">{t('todos.sortDueDate')}</option>
          <option value="priority">{t('todos.sortPriority')}</option>
          <option value="title">{t('todos.sortTitle')}</option>
          <option value="created">{t('todos.sortCreated')}</option>
          <option value="manual">{t('todos.sortManual')}</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          title={order === 'asc' ? t('todos.ascending') : t('todos.descending')}
        >
          <ArrowDownUp className={`h-4 w-4 transition-transform ${order === 'desc' ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      {smartList === 'trash' ? (
        <div className="space-y-2">
          {(trashTodos ?? []).length === 0 ? (
            <EmptyState message={t('todos.trashEmpty')} />
          ) : (
            (trashTodos ?? []).map((todo) => (
              <div key={todo.id} className="flex items-center gap-2 rounded-md border p-2 opacity-70">
                <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate text-sm">{todo.title}</span>
                <Button size="sm" variant="outline" onClick={() => handleRestore(todo.id)}>
                  {t('todos.restore')}
                </Button>
              </div>
            ))
          )}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : todos.length === 0 ? (
        <EmptyState message={t('todos.noTodos')} />
      ) : sort === 'manual' && view !== 'kanban' && view !== 'tree' ? (
        /* Manual-order flat list with move controls */
        <div className="space-y-6">
          <div className="space-y-2">
            {pendingTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p>
            ) : (
              pendingTodos.map((todo, i) => (
                <div key={todo.id} className="flex items-stretch gap-1">
                  <div className="flex flex-col justify-center">
                    <button type="button" disabled={i === 0} onClick={() => handleMoveUp(i)} title={t('todos.moveUp')} className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={i === pendingTodos.length - 1} onClick={() => handleMoveDown(i)} title={t('todos.moveDown')} className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">{renderTodoCard(todo)}</div>
                </div>
              ))
            )}
          </div>
          {doneTodos.length > 0 && smartList === 'all' && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('todos.completed')} ({doneTodos.length})</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {doneTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
        </div>
      ) : view === 'tree' ? (
        /* Tree View — outliner rows nested by parent_id */
        <div className="space-y-2">
          <div className="flex justify-end gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCollapsed(new Set())}>
              {t('todos.expandAll')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCollapsed(new Set(todos.map((x) => x.id)))}>
              {t('todos.collapseAll')}
            </Button>
          </div>
          <div className="rounded-md border p-1">
            <TodoTree
              nodes={todoTree}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onToggle={handleToggle}
              onRename={handleRename}
              onEdit={openEdit}
              onDelete={setConfirmDelete}
              onMove={handleTreeMove}
              onAddChild={openCreateChild}
              formatDate={formatDate}
              selectable={selectionMode}
              selectedIds={selectedIds}
              onSelectToggle={toggleSelect}
            />
          </div>
        </div>
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
          {doneTodos.length > 0 && smartList === 'all' && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('todos.completed')} ({doneTodos.length})</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {doneTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kanban View — drag a card to the other column to toggle its status */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Circle className="h-4 w-4 text-muted-foreground" />
              {t('todos.pending')} ({pendingTodos.length})
            </h3>
            <div
              className="space-y-2 min-h-[200px] bg-muted/30 rounded-lg p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleColumnDrop('pending')}
            >
              {pendingTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p>
              ) : (
                pendingTodos.map((todo) => (
                  <div
                    key={todo.id}
                    draggable
                    onDragStart={() => setDragId(todo.id)}
                    onDragEnd={() => setDragId(null)}
                    className={dragId === todo.id ? 'opacity-50' : ''}
                  >
                    {renderTodoCard(todo, true)}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {t('todos.done')} ({doneTodos.length})
            </h3>
            <div
              className="space-y-2 min-h-[200px] bg-muted/30 rounded-lg p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleColumnDrop('done')}
            >
              {doneTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p>
              ) : (
                doneTodos.map((todo) => (
                  <div
                    key={todo.id}
                    draggable
                    onDragStart={() => setDragId(todo.id)}
                    onDragEnd={() => setDragId(null)}
                    className={dragId === todo.id ? 'opacity-50' : ''}
                  >
                    {renderTodoCard(todo, true)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      {/* Create/Edit Dialog */}
      <TodoFormDialog
        key={editing?.id ?? presetParent?.id ?? 'new'}
        open={dialogOpen}
        editing={editing}
        contacts={contacts}
        tags={tags}
        parentCandidates={todos}
        presetParentId={presetParent?.id ?? null}
        onContactsChange={setContacts}
        onClose={() => { setDialogOpen(false); setPresetParent(null) }}
      />

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

      {/* Keyboard Shortcuts Help */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('todos.shortcuts')}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm py-1">
            {([
              ['N', t('todos.newTodo')],
              ['/', t('todos.searchPlaceholder')],
              ['1', t('todos.viewTimeline')],
              ['2', t('todos.viewGrouped')],
              ['3', t('todos.viewKanban')],
              ['4', t('todos.viewTree')],
              ['?', t('todos.shortcutsHelp')],
            ] as const).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-medium">{key}</kbd>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShortcutsOpen(false)}>{t('todos.gotIt')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
