import { lazy, Suspense, useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useContactsList } from '../hooks/api/useContacts'
import { useTagsList } from '../hooks/api/useTags'
import { rootKey } from '../hooks/api/keys'
import { todosApi } from '../api/todos'
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
import { Plus, Trash2, CheckCircle2, Loader2, ListChecks, AlignJustify, Columns, Search, ArrowDownUp, X, ChevronUp, ChevronDown, Keyboard, CheckSquare, Download, ListTree, ListPlus, MoreVertical, Eye, EyeOff, Tags } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '../components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { Todo, TodoSort, TodoListParams, TodoUpdateInput } from '../types'
import EmptyState from '../components/EmptyState'
import TodoCard from '../components/TodoCard'
import TodoSubtaskList from '../components/TodoSubtaskList'
import TodoSortableGroups from '../components/TodoSortableGroups'
import LoadMoreBar from '../components/LoadMoreBar'
import { matchesColumn } from '../lib/kanban'
import { useKanbanColumns } from '../hooks/api/useKanbanColumns'
import type { KanbanColumn } from '../api/settings'
import TodoTree from '../components/TodoTreeRow'
import { type KanbanLane } from '../components/KanbanBoard'
import { buildLazyTree, descendantIds, isSettledStatus, type TodoNode } from '../lib/buildTodoTree'
import { subtreeProgressFromMap } from '../lib/todoProgress'
import { usePomodoroStore } from '../stores/pomodoro'
import { useTodoCollapseStore } from '../stores/todoCollapse'
import {
  useTodosInfinite,
  useTodoChildrenMap,
  useCreateTodo,
  useUpdateTodo,
  useToggleTodoStatus,
  useSetTodoStatus,
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

// The tree/list experience is the default path. Load editing and board-only
// UI only after the user asks for it, keeping the first Todo render lean.
const KanbanBoard = lazy(() => import('../components/KanbanBoard'))
const TodoFormDialog = lazy(() => import('../components/TodoFormDialog').then((m) => ({ default: m.TodoFormDialog })))
const TodoDetailDrawer = lazy(() => import('../components/TodoDetailDrawer').then((m) => ({ default: m.TodoDetailDrawer })))

// TickTick-style smart lists. Each maps to a set of backend list params.
type SmartList = 'all' | 'today' | 'next7' | 'overdue' | 'pending' | 'deferred' | 'doneToday' | 'doneThisWeek' | 'completed' | 'abandoned' | 'trash'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Monday 00:00 of the argument's week — the same boundary the backend's
// done_this_week stat uses.
function startOfWeek(d: Date) {
  const start = startOfDay(d)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
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
    case 'deferred':
      // The stat strip's 已推迟 bucket: pending tasks whose start_time is in
      // the future. (No `started` here — it would exclude exactly these.)
      return { deferred: true }
    case 'doneToday':
      return { status: 'done', done_after: todayStart.toISOString() }
    case 'doneThisWeek':
      return { status: 'done', done_after: startOfWeek(new Date()).toISOString() }
    case 'completed':
      return { status: 'done' }
    case 'abandoned':
      return { status: 'abandoned' }
    case 'trash':
      return {} // trash uses a separate fetch; these params are unused
    default:
      return {}
  }
}


export default function TodosPage() {
  const { t } = useTranslation()
  // Contacts/tags come from the shared React-Query cache (30s staleTime) instead
  // of raw per-mount fetches — navigating between pages no longer re-pulls them.
  const qc = useQueryClient()
  const { data: contactsData } = useContactsList({ page: 1, page_size: 100 })
  const contacts = useMemo(() => contactsData?.items ?? [], [contactsData])
  const { data: tagsData } = useTagsList(1, 200)
  const tags = useMemo(() => tagsData?.items ?? [], [tagsData])
  // TickTick-style landing: first visit opens the Today list; the choice is
  // remembered so returning users land where they left off.
  const [smartList, setSmartList] = useState<SmartList>(() => {
    const saved = localStorage.getItem('todoSmartList') as SmartList | null
    return saved ?? 'today'
  })
  const [quickTitle, setQuickTitle] = useState('')
  const [quickDue, setQuickDue] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'' | 'low' | 'normal' | 'high'>('')
  // Multi-label filter (any-of): tasks tagged with ANY of the selected tags.
  const [tagFilters, setTagFilters] = useState<number[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<TodoSort>('due_date')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [view, setView] = useState<TodoView>(
    () => (localStorage.getItem('todoView') as TodoView) || 'grouped',
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  // Detail drawer (right slide-over): the editing surface for existing todos.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Todo | null>(null)
  const pageSize = 50
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // Lazy tree expand state: ids in the set are expanded (default: all
  // collapsed — children are fetched per node on first expand).
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem('todoTreeExpanded')
      return raw ? new Set<number>(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [expandingAll, setExpandingAll] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  // One-click "hide completed & abandoned": keeps the working list lean.
  // Persisted so the choice survives reloads, like the view/smart-list choices
  // above.
  const [hideCompleted, setHideCompleted] = useState(() => localStorage.getItem('todoHideCompleted') === '1')

  // Debounce the search box so typing doesn't fire a request per keystroke.
  // Filter changes swap the query key, which resets pagination to page 1.
  useEffect(() => {
    const handle = setTimeout(() => setQ(searchInput.trim()), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Persist the chosen view mode + smart list + tree expand state across reloads.
  useEffect(() => {
    localStorage.setItem('todoView', view)
  }, [view])
  useEffect(() => {
    localStorage.setItem('todoSmartList', smartList)
  }, [smartList])
  useEffect(() => {
    localStorage.setItem('todoTreeExpanded', JSON.stringify([...expanded]))
  }, [expanded])
  useEffect(() => {
    localStorage.setItem('todoHideCompleted', hideCompleted ? '1' : '0')
  }, [hideCompleted])
  // One-time cleanup of the pre-lazy-tree collapse-state key.
  useEffect(() => {
    localStorage.removeItem('todoTreeCollapsed')
  }, [])

  const listParams: TodoListParams = {
    ...smartListParams(smartList),
    priority: priorityFilter || undefined,
    tag_id: tagFilters.length > 0 ? tagFilters : undefined,
    q: q || undefined,
    sort,
    order,
    page_size: pageSize,
  }
  // Flat views (timeline / grouped / kanban / manual) share one accumulating
  // "load more" query; the lazy tree fetches roots only and pulls children per
  // expanded node. Only the active view's query is enabled.
  const flatQuery = useTodosInfinite(listParams, { enabled: view !== 'tree' && smartList !== 'trash' })
  // The tree is an outliner — sibling order IS the manual sort_order. Its
  // queries are pinned to manual/asc: fetching with the toolbar sort (default
  // due_date) would make every drop snap back to its old slot on refetch.
  // Sorted browsing belongs to the flat/kanban/timeline views.
  const rootQuery = useTodosInfinite(
    { ...listParams, sort: 'manual', order: 'asc', roots_only: true },
    { enabled: view === 'tree' && smartList !== 'trash' },
  )
  // Children are fetched WITHOUT the smart-list filters (only sort/order):
  // a parent that matches the filter must show its whole subtree — otherwise
  // a subtask due next week silently vanishes under a "today" parent. The
  // filters keep applying to the roots themselves.
  const childrenMap = useTodoChildrenMap(view === 'tree' ? [...expanded] : [], { sort: 'manual', order: 'asc' })
  const { data: stats } = useTodoStats()
  const { data: trashTodos } = useTodoTrash(smartList === 'trash')
  const restoreTodo = useRestoreTodo()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const toggleTodo = useToggleTodoStatus()
  const setStatusTodo = useSetTodoStatus()
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

  const todos = useMemo(() => {
    const data = view === 'tree' ? rootQuery.data : flatQuery.data
    return data?.pages.flatMap((p) => p.items) ?? []
  }, [view, rootQuery.data, flatQuery.data])
  const total = (view === 'tree' ? rootQuery.data : flatQuery.data)?.pages[0]?.total ?? 0
  const loading = view === 'tree' ? rootQuery.isPending : flatQuery.isPending

  // One-click visibility filter. Meaningless on the settled-only lists
  // (Completed / Abandoned / Done today / Done this week — everything there is
  // settled, hiding would blank the page) and on trash, so the toggle is
  // neither rendered nor applied there.
  const settledOnlyList = smartList === 'completed' || smartList === 'abandoned' || smartList === 'doneToday' || smartList === 'doneThisWeek'
  const hideDoneApplicable = !settledOnlyList && smartList !== 'trash'
  const hideDone = hideCompleted && hideDoneApplicable
  // The display set every view renders from. Children of a hidden settled
  // parent surface as top-level cards (presentIds/isTopLevel below are
  // computed over this set, mirroring buildTodoTree's orphan rule) so pending
  // work never disappears with its completed/abandoned parent.
  const displayTodos = useMemo(
    () => (hideDone ? todos.filter((t) => !isSettledStatus(t.status)) : todos),
    [todos, hideDone],
  )

  // Every loaded todo: in the tree view `todos` holds only roots — children
  // live in the per-parent slices. Lookups that must reach them (rename, the
  // parent-title hint, the nest cycle guard) go through this map instead.
  const todoByIdLoaded = useMemo(() => {
    const m = new Map<number, Todo>()
    for (const t of todos) m.set(t.id, t)
    for (const slice of childrenMap.values()) for (const t of slice.items) m.set(t.id, t)
    return m
  }, [todos, childrenMap])

  const openCreate = useCallback(() => { setEditing(null); setDialogOpen(true) }, [])
  // Inline child quick-add (card subtask area / tree "+"): create directly,
  // no dialog. In the tree view the parent auto-expands so the new child is
  // visible immediately.
  const handleCreateChild = useCallback(async (parent: Todo, title: string) => {
    const v = title.trim()
    if (!v) return
    try {
      await createTodo.mutateAsync({ title: v, parent_id: parent.id })
      setExpanded((prev) => (prev.has(parent.id) ? prev : new Set(prev).add(parent.id)))
      // Flat views fold through the collapse store instead of `expanded`.
      useTodoCollapseStore.getState().reveal(parent.id)
    } catch {
      toast.error(t('todos.createFailed'))
    }
  }, [createTodo, t])

  // Global keyboard shortcuts. Ignored while typing in a field or when a
  // dialog is open so they never hijack text entry.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (dialogOpen || drawerOpen || confirmDelete || shortcutsOpen) return
      switch (e.key) {
        case 'n': case 'N':
          e.preventDefault(); openCreate(); break
        case '/':
          e.preventDefault(); searchRef.current?.focus(); break
        case '1': setView('timeline'); break
        case '2': setView('grouped'); break
        case '3': setView('kanban'); break
        case '4': setView('tree'); break
        case 'h': case 'H':
          setHideCompleted((v) => !v); break
        case '?': setShortcutsOpen(true); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, drawerOpen, confirmDelete, shortcutsOpen, openCreate])

  const openEdit = useCallback((todo: Todo) => {
    setEditing(todo)
    setDrawerOpen(true)
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

  // Explicit status change (done / abandoned / back to pending) — everything
  // except the plain pending↔done flip, which keeps using the toggle so
  // completing a recurring task still advances it.
  const handleSetStatus = useCallback(async (id: number, status: Todo['status']) => {
    try {
      await setStatusTodo.mutateAsync({ id, status })
    } catch {
      // ignore — the optimistic update rolls back
    }
  }, [setStatusTodo])

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
    // Cap the export fetch instead of pulling up to 100k todos — buildICS only
    // needs the due-time ones anyway. Warn if truncated.
    const cap = 1000
    try {
      const res = await todosApi.list({ status: 'pending', page: 1, page_size: cap })
      const items = res.data?.items ?? []
      if ((res.data?.total ?? 0) > cap) {
        toast.warning(t('todos.exportIcsTruncated', { n: cap }))
      }
      const ics = buildICS(items)
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

  // Inline rename: the backend Update overwrites scalar fields, so we resend the
  // full payload with only the title changed to avoid wiping other fields.
  // fullUpdateData builds that payload for every mutation that only changes a
  // field or two (rename, reschedule, kanban priority drops).
  const fullUpdateData = useCallback((todo: Todo, overrides: Partial<TodoUpdateInput> = {}): TodoUpdateInput => ({
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    status: todo.status,
    due_time: todo.due_time,
    amount: todo.amount,
    amount_type: todo.amount_type,
    contact_ids: todo.contact_ids,
    color: todo.color,
    repeat: todo.repeat,
    ...overrides,
  }), [])

  // One-click "postpone to tomorrow" (TickTick's signature action): tomorrow
  // at the same clock time, or end of day (23:59) when the task has no due date.
  const handlePostpone = useCallback((todo: Todo) => {
    const next = new Date()
    next.setDate(next.getDate() + 1)
    if (todo.due_time) {
      const src = new Date(todo.due_time)
      next.setHours(src.getHours(), src.getMinutes(), 0, 0)
    } else {
      next.setHours(23, 59, 0, 0)
    }
    updateTodo.mutate({ id: todo.id, data: fullUpdateData(todo, { due_time: next.toISOString() }) })
  }, [updateTodo, fullUpdateData])

  // Drag-to-reschedule (timeline / grouped views): move the due date to the
  // target day — or clear it when dropping on the no-date group — preserving
  // the time of day; undated tasks land at end of day (23:59).
  const handleReschedule = useCallback((todo: Todo, target: Date | null) => {
    if (target == null) {
      updateTodo.mutate({ id: todo.id, data: fullUpdateData(todo, { clear_due_time: true }) })
      return
    }
    const next = new Date(target)
    if (todo.due_time) {
      const src = new Date(todo.due_time)
      next.setHours(src.getHours(), src.getMinutes(), 0, 0)
    } else {
      next.setHours(23, 59, 0, 0)
    }
    updateTodo.mutate({ id: todo.id, data: fullUpdateData(todo, { due_time: next.toISOString() }) })
  }, [updateTodo, fullUpdateData])

  // Kanban: columns are user-defined predicates (status / priority / tag);
  // dropping a card applies the column's predicate to the todo — plus the
  // swimlane's (priority) when swimlanes are on.
  const { columns: kanbanColumns, addColumn, removeColumn, setColumns: setKanbanColumns } = useKanbanColumns(view === 'kanban')
  const handleKanbanDrop = (todo: Todo, col: KanbanColumn, lane?: KanbanLane) => {
    const colMatch = matchesColumn(todo, col)
    const laneMatch = !lane || todo.priority === lane.value
    if (colMatch && laneMatch) return
    if (!colMatch) {
      if (col.kind === 'status') {
        // The plain pending→done flip keeps the toggle (recurring tasks advance
        // to their next occurrence there); any other transition is explicit.
        if (todo.status === 'pending' && col.value === 'done') {
          handleToggle(todo.id)
        } else {
          handleSetStatus(todo.id, col.value as Todo['status'])
        }
      } else if (col.kind === 'priority') {
        // Full payload — a partial update would wipe the description/contacts/
        // color/repeat fields (the backend replaces scalars wholesale).
        updateTodo.mutate({ id: todo.id, data: fullUpdateData(todo, { priority: col.value as Todo['priority'] }) })
      } else {
        const tag = tags.find((tg) => String(tg.id) === col.value || tg.name === col.value)
        if (!tag) return
        const next = [...(todo.tags ?? [])]
        if (!next.some((tg) => tg.id === tag.id)) next.push(tag)
        replaceTags.mutate({ todoId: todo.id, tagIds: next.map((tg) => tg.id) })
      }
    }
    if (!laneMatch) updateTodo.mutate({ id: todo.id, data: fullUpdateData(todo, { priority: lane.value as Todo['priority'] }) })
  }
  const handleKanbanColumnsReorder = useCallback((next: KanbanColumn[]) => {
    setKanbanColumns(next)
  }, [setKanbanColumns])
  const handleKanbanReorder = useCallback((id: number, afterId: number | null) => {
    reorderTodo.mutate({ id, afterId })
  }, [reorderTodo])
  // Quick-create inside a column carries the column's predicate (status /
  // priority applied at create; tag applied right after via replaceTags).
  const handleKanbanCreate = useCallback(async (title: string, col: KanbanColumn, lane?: KanbanLane) => {
    try {
      const priority = (lane?.value ?? (col.kind === 'priority' ? col.value : undefined)) as Todo['priority'] | undefined
      if (col.kind === 'tag') {
        const tag = tags.find((tg) => String(tg.id) === col.value || tg.name === col.value)
        const created = await createTodo.mutateAsync({ title, priority })
        if (tag && created) replaceTags.mutate({ todoId: created.data.id, tagIds: [tag.id] })
      } else {
        await createTodo.mutateAsync({
          title,
          priority,
          status: col.kind === 'status' ? (col.value as Todo['status']) : undefined,
        })
      }
    } catch {
      toast.error(t('todos.createFailed'))
    }
  }, [createTodo, replaceTags, tags, t])

  const handleRename = useCallback(async (id: number, title: string) => {
    // Search every loaded todo, not just the current list — tree-view children
    // come from the per-parent slices and aren't part of `todos`.
    const todo = todoByIdLoaded.get(id)
    if (!todo) return
    try {
      await updateTodo.mutateAsync({ id, data: fullUpdateData(todo, { title }) })
    } catch {
      toast.error(t('todos.renameFailed'))
    }
  }, [todoByIdLoaded, updateTodo, fullUpdateData, t])

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
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
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

  // Flat-view nesting: children render inside their parent's card, so the
  // flat lists keep only top-level todos (parent absent from the current list
  // → the child surfaces at top level, same rule as buildTodoTree).
  const presentIds = useMemo(() => new Set(displayTodos.map((t) => t.id)), [displayTodos])
  const isTopLevel = useCallback(
    (t: Todo) => t.parent_id == null || !presentIds.has(t.parent_id),
    [presentIds],
  )
  // Flat views render subtask sections under each top-level card. Like the
  // tree and the detail drawer, those sections must show the parent's WHOLE
  // subtree regardless of the smart-list filter — a "today" parent's undated
  // subtask (or a pending child under a completed parent) never matches the
  // filtered flat list, so it would be invisible — including right after
  // being added. Hence the same unfiltered per-parent children slices the
  // tree uses, one per displayed parent that has children — including the
  // tree's pinned manual/asc sort: rows are drag-reorderable in every view,
  // so a toolbar sort (default due_date) would snap each dropped row back to
  // its old slot on refetch. The toolbar sort still governs the top-level
  // cards.
  const flatChildParents = useMemo(
    () => displayTodos.filter((t) => isTopLevel(t) && (t.child_count ?? 0) > 0).map((t) => t.id),
    [displayTodos, isTopLevel],
  )
  // Grandchildren cascade: any loaded child with children of its own joins
  // the id set so every depth renders (same accumulation as the drawer).
  const [deepChildIds, setDeepChildIds] = useState<Set<number>>(() => new Set())
  const flatChildrenMap = useTodoChildrenMap(
    view !== 'tree' && smartList !== 'trash' ? [...new Set([...flatChildParents, ...deepChildIds])] : [],
    { sort: 'manual', order: 'asc' },
  )
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const found = new Set<number>()
    for (const slice of flatChildrenMap.values()) {
      for (const c of slice.items) {
        if ((c.child_count ?? 0) > 0) found.add(c.id)
      }
    }
    setDeepChildIds((prev) => {
      if (prev.size === found.size && [...found].every((id) => prev.has(id))) return prev
      return found
    })
  }, [flatChildrenMap])
  /* eslint-enable react-hooks/set-state-in-effect */
  const childrenByParent = useMemo(() => {
    const m = new Map<number, Todo[]>()
    if (view === 'tree') return m
    for (const [parentId, slice] of flatChildrenMap) {
      if (slice.items.length > 0) m.set(parentId, slice.items)
    }
    return m
  }, [view, flatChildrenMap])
  // Cross-subtask completion roll-up for card chips (incl. kanban): done/total
  // over every descendant, computed from the loaded children map.
  const subtaskProgress = useMemo(() => {
    const m = new Map<number, { done: number; total: number }>()
    for (const t of todos) m.set(t.id, subtreeProgressFromMap(childrenByParent, t.id))
    return m
  }, [todos, childrenByParent])

  const pendingTodos = displayTodos.filter((t) => t.status === 'pending' && isTopLevel(t))
  const doneTodos = displayTodos.filter((t) => t.status === 'done' && isTopLevel(t))
  const abandonedTodos = displayTodos.filter((t) => t.status === 'abandoned' && isTopLevel(t))

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

  // Pomodoro start (timer lives in the global Zustand store — see AppLayout).
  const handleStartPomodoro = useCallback((todo: Todo) => {
    usePomodoroStore.getState().start(todo.id, todo.title)
  }, [])

  // Tree-view reparenting: indent/outdent/up/down all reduce to a single move
  // call (parent_id + place-after sibling). afterId 'last' appends at the end
  // of the sibling group (the server resolves it — see TodoTreeRow.MoveAfterId).
  const handleTreeMove = useCallback(async (id: number, parentId: number | null, afterId: number | null | 'last') => {
    try {
      await moveTodo.mutateAsync({
        id,
        parentId,
        afterId: afterId === 'last' ? null : afterId,
        position: afterId === 'last' ? 'last' : undefined,
      })
    } catch {
      toast.error(t('todos.reorderFailed'))
    }
  }, [moveTodo, t])

  // Drop-on-card nesting (flat views + kanban): make the dragged todo the last
  // child of the target. Guarded against cycles client-side so an illegal drop
  // just no-ops instead of flashing an error toast (the backend would reject
  // it anyway).
  const handleNest = useCallback((id: number, parentId: number) => {
    if (id === parentId || descendantIds([...todoByIdLoaded.values()], id).has(parentId)) return
    // Reveal the target's subtask section so the nested todo lands in view.
    useTodoCollapseStore.getState().reveal(parentId)
    void handleTreeMove(id, parentId, 'last')
  }, [todoByIdLoaded, handleTreeMove])
  const toggleExpand = useCallback((id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  , [])

  const todoTree = useMemo(() => buildLazyTree(displayTodos, childrenMap, { hideDone }), [displayTodos, childrenMap, hideDone])

  // Iterative "expand all" for the lazy tree: expand every loaded node the
  // server says has children; as children slices arrive the effect re-runs and
  // descends further, until nothing new is expandable and nothing is loading.
  // Expansion is driven by data arrival (each slice landing grows the tree), so
  // an effect is the only place it can react — setState here is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!expandingAll) return
    const toExpand: number[] = []
    let pending = 0
    const walk = (nodes: TodoNode[]) => {
      for (const n of nodes) {
        if ((n.todo.child_count ?? 0) > 0) {
          if (expanded.has(n.todo.id)) {
            if (!childrenMap.get(n.todo.id)?.loaded) pending++
          } else {
            toExpand.push(n.todo.id)
          }
        }
        walk(n.children)
      }
    }
    walk(todoTree)
    if (toExpand.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev)
        toExpand.forEach((id) => next.add(id))
        return next
      })
    } else if (pending === 0) {
      setExpandingAll(false)
    }
  }, [expandingAll, todoTree, expanded, childrenMap])
  /* eslint-enable react-hooks/set-state-in-effect */
  // Tree drag & drop: id of the row being dragged (whole subtree follows).
  const [treeDragId, setTreeDragId] = useState<number | null>(null)
  const dragSubtreeSize = useMemo(() => {
    if (treeDragId == null) return 0
    const find = (nodes: TodoNode[]): TodoNode | null => {
      for (const n of nodes) {
        if (n.todo.id === treeDragId) return n
        const hit = find(n.children)
        if (hit) return hit
      }
      return null
    }
    const count = (n: TodoNode): number =>
      1 + n.children.reduce((acc, c) => acc + count(c), 0)
    const node = find(todoTree)
    return node ? count(node) : 0
  }, [treeDragId, todoTree])
  // id → title for the "nested under <parent>" hint on cards in non-tree views.
  const todoTitleById = useMemo(() => new Map([...todoByIdLoaded.values()].map((t) => [t.id, t.title])), [todoByIdLoaded])

  // Smart date groups for the grouped view. `target` is the due date a card
  // takes when dragged into the group (drop-to-reschedule): today/tomorrow map
  // to themselves, 本周 to the end of this week, 稍后 to next Monday, and the
  // no-date group clears the due time.
  const groupedTodos = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
    weekEnd.setHours(23, 59, 59, 0)
    const nextMonday = startOfDay(weekEnd)
    nextMonday.setDate(nextMonday.getDate() + 1)
    const groups: { key: string; label: string; target: Date | null; items: Todo[] }[] = [
      { key: 'today', label: t('todos.today'), target: today, items: [] },
      { key: 'tomorrow', label: t('todos.tomorrow'), target: tomorrow, items: [] },
      { key: 'thisWeek', label: t('todos.thisWeek'), target: weekEnd, items: [] },
      { key: 'later', label: t('todos.later'), target: nextMonday, items: [] },
      { key: 'noDue', label: t('todos.noDueDate'), target: null, items: [] },
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
  // pendingTodos is already top-level-only (see its derivation).

  // Timeline groups keyed by calendar day; `target` reschedules a dropped card
  // to that day (the trailing no-date group clears the due time).
  const timelineGroups = useMemo(() => {
    const map = new Map<string, { label: string; target: Date | null; items: Todo[] }>()
    for (const todo of displayTodos) {
      if (!isTopLevel(todo)) continue
      const d = todo.due_time ? new Date(todo.due_time) : null
      const key = d ? d.toDateString() : 'none'
      if (!map.has(key)) {
        map.set(key, { label: d ? formatDay(todo.due_time!) : t('todos.noDueDate'), target: d ? startOfDay(d) : null, items: [] })
      }
      map.get(key)!.items.push(todo)
    }
    return Array.from(map.entries()).map(([key, g]) => ({ key, ...g }))
  }, [displayTodos, isTopLevel, t])

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
      onSetStatus={handleSetStatus}
      onTogglePin={handleTogglePin}
      onSync={handleSync}
      onEdit={openEdit}
      onRename={handleRename}
      onDuplicate={handleDuplicate}
      onDelete={setConfirmDelete}
      formatDate={formatDate}
      parentTitle={todo.parent_id ? todoTitleById.get(todo.parent_id) : undefined}
      subtaskProgress={subtaskProgress.get(todo.id)}
      onStartPomodoro={handleStartPomodoro}
      onPostpone={handlePostpone}
      // Subtask drag & drop: rows carry the tree's tri-zone semantics, and a
      // drop on the card body nests under this todo. Shares the tree's drag
      // state, so drags interoperate across cards (one view renders at a time).
      subtaskDragId={view !== 'tree' ? treeDragId : undefined}
      onNestSubtask={view !== 'tree' ? handleNest : undefined}
      // Compact (kanban) cards DO get the subtask list, but TodoCard keeps it
      // collapsed behind the progress chip: the board cell stays lean and a
      // drag overlay (fresh mount) never carries the expanded list.
      subtasks={view !== 'tree' ? (
        <TodoSubtaskList
          todo={todo}
          childrenByParent={childrenByParent}
          onToggle={(sub) => void handleToggle(sub.id)}
          onEdit={openEdit}
          onCreateChild={handleCreateChild}
          onDelete={setConfirmDelete}
          onStartPomodoro={handleStartPomodoro}
          hideDone={hideDone}
          onMove={handleTreeMove}
          dragId={treeDragId}
          onDragIdChange={setTreeDragId}
        />
      ) : undefined}
    />
  )

  return (
    <div className="space-y-2">
      {/* Header — view toggle + one overflow menu; creating lives in the
          quick-add bar below (fast path) with a "detailed" button for the
          full form. Keeping one create surface avoids the duplicate
          "新建" buttons this page used to have. */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('todos.title')}</h1>
        <div className="flex items-center gap-2">
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" title={t('common.more')} aria-label={t('common.more')} />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}>
                <CheckSquare className="h-4 w-4" />
                {selectionMode ? t('common.cancel') : t('todos.select')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportICS}>
                <Download className="h-4 w-4" />
                {t('todos.exportIcs')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
                <Keyboard className="h-4 w-4" />
                {t('todos.shortcuts')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Productivity overview — one compact inline strip instead of a card
          grid. Each stat is a link into the smart list that matches its
          bucket (待办 → 进行中, 已逾期 → 逾期, 已推迟/今日完成/本周完成 → the
          dedicated lists). */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {([
            { list: 'pending', label: t('todos.statPending'), value: stats.pending, valueClass: 'text-foreground' },
            { list: 'overdue', label: t('todos.statOverdue'), value: stats.overdue, valueClass: stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground' },
            { list: 'deferred', label: t('todos.statDeferred'), value: stats.deferred, valueClass: stats.deferred > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground' },
            { list: 'doneToday', label: t('todos.statDoneToday'), value: stats.done_today, valueClass: 'text-green-600 dark:text-green-400' },
            { list: 'doneThisWeek', label: t('todos.statDoneThisWeek'), value: stats.done_this_week, valueClass: 'text-foreground' },
          ] as const).map(({ list, label, value, valueClass }) => (
            <button
              key={list}
              type="button"
              onClick={() => setSmartList(list)}
              className={`rounded-sm px-1 text-left transition-colors hover:bg-accent hover:text-accent-foreground ${
                smartList === list ? 'font-medium text-foreground' : 'text-muted-foreground'
              }`}
            >
              {label} <b className={`text-sm font-semibold ${valueClass}`}>{value}</b>
            </button>
          ))}
        </div>
      )}

      {/* Quick add bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder={t('todos.quickAdd')}
            className="h-8 pl-8"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd() } }}
          />
        </div>
        <Input
          type="datetime-local"
          value={quickDue}
          onChange={(e) => setQuickDue(e.target.value)}
          className="h-8 w-full sm:w-40"
          aria-label={t('todos.dueTime')}
        />
        <Button size="sm" className="self-end sm:self-auto" onClick={handleQuickAdd} disabled={!quickTitle.trim() || createTodo.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {t('common.create')}
        </Button>
        {/* The full form (description / tags / contacts / repeat …) stays one
            click away without a second big "新建" button in the header. */}
        <Button variant="outline" size="sm" className="h-8 w-9 p-0 self-end sm:self-auto" onClick={openCreate} title={t('todos.advancedCreate')} aria-label={t('todos.advancedCreate')}>
          <ListPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Smart-list switcher + filters in one toolbar row (wraps on narrow screens) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Smart lists as one dropdown — the old 8-button segmented bar was
           the page's biggest source of button clutter. */}
        <select
          value={smartList}
          onChange={(e) => setSmartList(e.target.value as SmartList)}
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
          aria-label={t('todos.smartList')}
        >
          {(['all', 'today', 'next7', 'overdue', 'pending', 'deferred', 'completed', 'doneToday', 'doneThisWeek', 'abandoned', 'trash'] as SmartList[]).map((s) => (
            <option key={s} value={s}>
              {t(`todos.${s}`)}
            </option>
          ))}
        </select>

        <div className="relative min-w-[160px] flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('todos.searchPlaceholder')}
            className="h-7 pl-8 pr-7"
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
          onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
          aria-label={t('todos.priority')}
        >
          <option value="">{t('todos.allPriorities')}</option>
          <option value="high">{t('todos.high')}</option>
          <option value="normal">{t('todos.normal')}</option>
          <option value="low">{t('todos.low')}</option>
        </select>
        {/* Multi-label filter: any-of (OR) — a task shows when it carries any
           one of the checked tags. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={`flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs ${tagFilters.length > 0 ? 'border-primary/40 bg-primary/5 text-foreground' : 'bg-background text-muted-foreground'}`}
                aria-label={t('todos.tags')}
              />
            }
          >
            <Tags className="h-3.5 w-3.5" />
            <span className="max-w-24 truncate">
              {tagFilters.length === 0
                ? t('todos.allTags')
                : tagFilters.length === 1
                  ? tags.find((tg) => tg.id === tagFilters[0])?.name ?? t('todos.tags')
                  : t('todos.tagsSelected', { n: tagFilters.length })}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {tags.length === 0 && (
              <div className="px-1.5 py-1 text-xs text-muted-foreground">{t('todos.noTags')}</div>
            )}
            {tags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.id}
                checked={tagFilters.includes(tag.id)}
                onCheckedChange={(checked) =>
                  setTagFilters((prev) =>
                    checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id),
                  )
                }
                className="text-xs"
              >
                <span
                  className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color || '#94a3b8' }}
                />
                <span className="truncate">{tag.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
            {tagFilters.length > 0 && (
              <DropdownMenuItem className="text-xs" onClick={() => setTagFilters([])}>
                <X className="h-3.5 w-3.5" />
                {t('todos.clearTags')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Sort controls are meaningless in the tree view — the tree's order
            is always manual (see the pinned rootQuery/childrenMap sort). */}
        {view !== 'tree' && (
          <>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as TodoSort)}
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
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
              className="h-7 w-7 p-0"
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              title={order === 'asc' ? t('todos.ascending') : t('todos.descending')}
            >
              <ArrowDownUp className={`h-3.5 w-3.5 transition-transform ${order === 'desc' ? 'rotate-180' : ''}`} />
            </Button>
          </>
        )}
        {/* One-click hide/show completed & abandoned — applies to every view;
           hidden on the Completed/Abandoned lists and trash where it has
           nothing to act on. */}
        {hideDoneApplicable && (
          <Button
            variant={hideDone ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setHideCompleted((v) => !v)}
            title={hideDone ? t('todos.showCompleted') : t('todos.hideCompleted')}
            aria-label={hideDone ? t('todos.showCompleted') : t('todos.hideCompleted')}
          >
            {hideDone ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
        )}
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
      ) : displayTodos.length === 0 ? (
        <EmptyState message={t('todos.noTodos')} />
      ) : sort === 'manual' && view !== 'kanban' && view !== 'tree' ? (
        /* Manual-order flat list: drag to reorder (the up/down buttons remain
           for precise/keyboard moves). */
        <div className="space-y-3">
          {pendingTodos.length > 0 && (
            <TodoSortableGroups
              groups={[{ key: 'manual', items: pendingTodos }]}
              itemAreaClass="space-y-1.5"
              renderCard={(todo) => {
                const i = pendingTodos.indexOf(todo)
                return (
                  <div className="flex items-stretch gap-1">
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
                )
              }}
              onReorder={handleMove}
              onNest={handleNest}
              renderOverlayCard={(todo) => renderTodoCard(todo, true)}
            />
          )}
          {pendingTodos.length === 0 && !settledOnlyList && (
            <p className="text-sm text-muted-foreground text-center py-8">{t('todos.noTodos')}</p>
          )}
          {doneTodos.length > 0 && (smartList === 'all' || settledOnlyList) && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('todos.completed')} ({doneTodos.length})</h3>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {doneTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
          {abandonedTodos.length > 0 && (smartList === 'all' || smartList === 'abandoned') && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('todos.abandoned')} ({abandonedTodos.length})</h3>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {abandonedTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
        </div>
      ) : view === 'tree' ? (
        /* Tree View — outliner rows nested by parent_id. Children load lazily
           on first expand (roots come from the roots_only query). */
        <div className="space-y-2">
          <div className="flex justify-end gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={expandingAll} onClick={() => setExpandingAll(true)}>
              {expandingAll ? t('todos.expanding') : t('todos.expandAll')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setExpanded(new Set()); setExpandingAll(false) }}>
              {t('todos.collapseAll')}
            </Button>
          </div>
          <div className="rounded-md border p-1">
            {treeDragId != null && (
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (treeDragId != null) void handleTreeMove(treeDragId, null, null)
                  setTreeDragId(null)
                }}
                className="mb-1 rounded-md border-2 border-dashed border-primary/60 bg-primary/5 px-3 py-1.5 text-center text-xs text-primary"
              >
                {t('todos.dropAsRoot', { count: dragSubtreeSize })}
              </div>
            )}
            <TodoTree
              nodes={todoTree}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              dragId={treeDragId}
              onDragIdChange={setTreeDragId}
              onToggle={handleToggle}
              onRename={handleRename}
              onEdit={openEdit}
              onDelete={setConfirmDelete}
              onMove={handleTreeMove}
              onCreateChild={handleCreateChild}
              onStartPomodoro={handleStartPomodoro}
              onTogglePin={handleTogglePin}
              formatDate={formatDate}
              selectable={selectionMode}
              selectedIds={selectedIds}
              onSelectToggle={toggleSelect}
              onLoadChildren={(id) => childrenMap.get(id)?.loadMore()}
            />
          </div>
        </div>
      ) : view === 'timeline' ? (
        /* Timeline View — drag a card onto another day to reschedule it
           (drop on 无日期 clears the due time). */
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
          <TodoSortableGroups
            className="space-y-3"
            groups={timelineGroups.map((g) => ({
              key: g.key,
              label: (
                <div className="relative flex items-center gap-2">
                  <span className="absolute -left-[18px] w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  <span className="text-sm font-medium text-muted-foreground">{g.label}</span>
                </div>
              ),
              items: g.items,
            }))}
            itemAreaClass="space-y-1.5 ml-2"
            renderCard={renderTodoCard}
            renderOverlayCard={(todo) => renderTodoCard(todo, true)}
            onGroupDrop={(todo, key) => {
              const g = timelineGroups.find((it) => it.key === key)
              handleReschedule(todo, g?.target ?? null)
            }}
            onNest={handleNest}
          />
        </div>
      ) : view === 'grouped' ? (
        /* Date-grouped View — drag a card into another bucket to reschedule:
           今天/明天 → that day, 本周 → end of this week, 稍后 → next Monday,
           无日期 → clear the due time. */
        <div className="space-y-3">
          {!settledOnlyList && (
            <TodoSortableGroups
              groups={groupedTodos
                .map((g) => ({
                  key: g.key,
                  label: <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h3>,
                  items: g.items,
                }))}
              itemAreaClass="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              renderCard={renderTodoCard}
              renderOverlayCard={(todo) => renderTodoCard(todo, true)}
              onGroupDrop={(todo, key) => {
                const g = groupedTodos.find((it) => it.key === key)
                handleReschedule(todo, g?.target ?? null)
              }}
              onNest={handleNest}
            />
          )}
          {doneTodos.length > 0 && (smartList === 'all' || settledOnlyList) && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{t('todos.completed')} ({doneTodos.length})</h3>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {doneTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
          {abandonedTodos.length > 0 && (smartList === 'all' || smartList === 'abandoned') && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{t('todos.abandoned')} ({abandonedTodos.length})</h3>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {abandonedTodos.map((todo) => renderTodoCard(todo))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kanban View — GitLab-style board (components/KanbanBoard.tsx):
           horizontal scrolling columns, cross-column drag applies the column
           predicate, in-column drag persists sort_order. */
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          <KanbanBoard
            todos={displayTodos}
            columns={kanbanColumns}
            tags={tags}
            addColumn={addColumn}
            removeColumn={removeColumn}
            onColumnsReorder={handleKanbanColumnsReorder}
            renderCard={(todo) => renderTodoCard(todo, true)}
            onCardDropColumn={handleKanbanDrop}
            onReorder={handleKanbanReorder}
            onNest={handleNest}
            onCreateInColumn={handleKanbanCreate}
            selectedIds={selectionMode ? selectedIds : undefined}
          />
        </Suspense>
      )}

      {smartList !== 'trash' && view === 'tree' ? (
        <LoadMoreBar
          loaded={todos.length}
          total={total}
          loading={rootQuery.isFetching}
          onMore={() => void rootQuery.fetchNextPage()}
        />
      ) : smartList !== 'trash' ? (
        <LoadMoreBar
          loaded={todos.length}
          total={total}
          loading={flatQuery.isFetching}
          onMore={() => void flatQuery.fetchNextPage()}
        />
      ) : null}

      {/* Create Dialog (editing lives in the detail drawer below) */}
      {dialogOpen && (
        <Suspense fallback={null}>
          <TodoFormDialog
            open
            editing={null}
            contacts={contacts}
            tags={tags}
            parentCandidates={todos}
            onContactsChange={() => qc.invalidateQueries({ queryKey: rootKey('contacts') })}
            onClose={() => setDialogOpen(false)}
          />
        </Suspense>
      )}

      {/* Detail Drawer — right slide-over for viewing/editing a todo */}
      {drawerOpen && editing && (
        <Suspense fallback={null}>
          <TodoDetailDrawer
            todo={editing}
            open
            contacts={contacts}
            tags={tags}
            parentCandidates={todos}
            onContactsChange={() => qc.invalidateQueries({ queryKey: rootKey('contacts') })}
            onClose={() => setDrawerOpen(false)}
            onToggleSubtask={(sub) => void handleToggle(sub.id)}
            onDeleteSubtask={setConfirmDelete}
            onStartPomodoro={handleStartPomodoro}
            onOpenTodo={openEdit}
            onCreateChild={handleCreateChild}
            hideDone={hideDone}
            subtaskDragId={treeDragId}
            onSubtaskDragIdChange={setTreeDragId}
            onMoveSubtask={handleTreeMove}
          />
        </Suspense>
      )}

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
              ['H', t('todos.toggleCompleted')],
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
