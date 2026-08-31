import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TodosPage from '../TodosPage'
import type { Todo, Contact, Tag, PaginatedData, TodoListParams } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'todos.title': '待办',
        'todos.noTodos': '暂无待办',
        'todos.newTodo': '新建待办',
        'todos.all': '全部',
        'todos.pending': '待办状态',
        'todos.done': '已完成',
        'todos.viewTimeline': '时间线',
        'todos.viewGrouped': '分组',
        'todos.viewKanban': '看板',
        'todos.low': '低',
        'todos.normal': '普通',
        'todos.high': '高',
        'todos.noDueDate': '无截止日期',
        'todos.completed': '已完成',
        'todos.abandoned': '已放弃',
        'todos.syncToEvent': '同步到事件',
        'todos.deleteConfirm': '确定删除此待办？',
        'common.cancel': '取消',
        'common.create': '创建',
      }
      return translations[key] || key
    },
    i18n: { language: 'zh' },
  }),
  // The page under test imports i18n (via lib/toast), which calls
  // i18n.use(initReactI18next) — the mock must provide it.
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    stats: vi.fn(),
    listTrash: vi.fn(),
    restore: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toggleStatus: vi.fn(),
    reorder: vi.fn(),
    togglePin: vi.fn(),
    syncToEvent: vi.fn(),
    duplicate: vi.fn(),
    delete: vi.fn(),
    bulk: vi.fn(),
    listItems: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    toggleItem: vi.fn(),
    reorderItem: vi.fn(),
    promoteItem: vi.fn(),
    deleteItem: vi.fn(),
    getTags: vi.fn(),
    replaceTags: vi.fn(),
  },
}))

vi.mock('../../api/settings', () => ({
  settingsApi: {
    getKanban: vi.fn().mockResolvedValue([
      { id: 'status-pending', label: 'pending', kind: 'status', value: 'pending' },
      { id: 'status-done', label: 'done', kind: 'status', value: 'done' },
    ]),
    updateKanban: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../api/contacts', () => ({
  contactsApi: {
    list: vi.fn(),
  },
}))

vi.mock('../../api/tags', () => ({
  tagsApi: {
    list: vi.fn(),
  },
}))

import { todosApi } from '../../api/todos'
import { contactsApi } from '../../api/contacts'
import { tagsApi } from '../../api/tags'
import type { AxiosResponse } from 'axios'

const mockedList = vi.mocked(todosApi.list)
const mockedCreate = vi.mocked(todosApi.create)
const mockedUpdate = vi.mocked(todosApi.update)
const mockedReplaceTags = vi.mocked(todosApi.replaceTags)
const mockedStats = vi.mocked(todosApi.stats)
const mockedTrash = vi.mocked(todosApi.listTrash)
const mockedContactsList = vi.mocked(contactsApi.list)
const mockedTagsList = vi.mocked(tagsApi.list)

function mockPage<T>(items: T[], total?: number): { data: PaginatedData<T> } {
  return { data: { items, total: total ?? items.length, page: 1, page_size: 50 } }
}

function mockAxios<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TodosPage />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('TodosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => void store.set(key, value)),
      removeItem: vi.fn((key: string) => void store.delete(key)),
      clear: vi.fn(() => store.clear()),
    })
    mockedList.mockResolvedValue(mockPage<Todo>([]))
    mockedStats.mockResolvedValue({ data: { total: 0, pending: 0, overdue: 0, deferred: 0, done_today: 0, done_this_week: 0 } })
    mockedTrash.mockResolvedValue({ data: [] })
    mockedContactsList.mockResolvedValue(mockAxios<PaginatedData<Contact>>({ items: [], total: 0, page: 1, page_size: 100 }))
    mockedTagsList.mockResolvedValue(mockAxios<PaginatedData<Tag>>({ items: [], total: 0, page: 1, page_size: 200 }))
  })

  it('renders empty state', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })
  })

  it('defaults to the Today smart list on first visit', async () => {
    renderPage()
    await waitFor(() => {
      // Today = pending + upper due bound (includes overdue), no lower bound.
      expect(mockedList).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', due_before: expect.any(String) }),
        expect.any(AbortSignal),
      )
    })
  })

  it('renders page title and controls', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('待办')).toBeInTheDocument()
      // One create surface: the quick-add bar (创建) + the detailed-form button.
      expect(screen.getByRole('button', { name: '创建' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'todos.advancedCreate' })).toBeInTheDocument()
      // Overflow menu for the less-frequent actions.
      expect(screen.getByRole('button', { name: 'common.more' })).toBeInTheDocument()
    })
  })

  it('renders todo items from API', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 1, title: 'Buy milk', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
    ]))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Buy milk')).toBeInTheDocument()
    })
    // The priority label appears both as the card badge and a filter option.
    expect(screen.getAllByText('普通').length).toBeGreaterThan(0)
  })

  it('renders done todo with completed section', async () => {
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'all')
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 2, title: 'Done task', status: 'done', priority: 'low', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
    ]))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Done task')).toBeInTheDocument()
      expect(screen.getByText('已完成 (1)')).toBeInTheDocument()
    })
  })

  it('keeps completed tasks visible in the grouped completed smart list', async () => {
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'all')
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 12, title: 'Grouped done task', status: 'done', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
    ]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Grouped done task')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('todos.smartList'), 'completed')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), expect.any(AbortSignal))
      expect(screen.getByText('Grouped done task')).toBeInTheDocument()
    })
  })

  it('keeps completed tasks visible in manual-order view', async () => {
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'all')
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 13, title: 'Manual done task', status: 'done', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
    ]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Manual done task')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('todos.sort'), 'manual')
    await user.selectOptions(screen.getByLabelText('todos.smartList'), 'completed')
    await waitFor(() => expect(screen.getByText('Manual done task')).toBeInTheDocument())
  })

  it('hides completed and abandoned tasks with one click and brings them back', async () => {
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'all')
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 1, title: 'Active task', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
      { id: 2, title: 'Finished task', status: 'done', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
      { id: 3, title: 'Dropped task', status: 'abandoned', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
    ]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Active task')).toBeInTheDocument()
      expect(screen.getByText('Finished task')).toBeInTheDocument()
      expect(screen.getByText('Dropped task')).toBeInTheDocument()
      expect(screen.getByText('已完成 (1)')).toBeInTheDocument()
      expect(screen.getByText('已放弃 (1)')).toBeInTheDocument()
    })

    // One click: every settled task disappears (done + abandoned grids).
    await user.click(screen.getByTitle('todos.hideCompleted'))
    await waitFor(() => {
      expect(screen.queryByText('Finished task')).not.toBeInTheDocument()
      expect(screen.queryByText('Dropped task')).not.toBeInTheDocument()
      expect(screen.queryByText('已完成 (1)')).not.toBeInTheDocument()
      expect(screen.queryByText('已放弃 (1)')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Active task')).toBeInTheDocument()

    // One click back: settled tasks show again.
    await user.click(screen.getByTitle('todos.showCompleted'))
    await waitFor(() => {
      expect(screen.getByText('Finished task')).toBeInTheDocument()
      expect(screen.getByText('Dropped task')).toBeInTheDocument()
    })
  })

  it('surfaces pending children of a hidden completed parent', async () => {
    // Completing a parent does NOT complete its children server-side, so
    // hiding the done parent must promote its pending child to a top-level
    // card instead of burying it (buildTodoTree's orphan rule).
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'all')
    const parent = { id: 1, title: 'Done parent', status: 'done', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' } as Todo
    const child = { id: 2, title: 'Kept child', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, child_count: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    mockedList.mockImplementation(async (params?: TodoListParams) =>
      params?.parent_id === 1
        ? mockPage<Todo>([child])
        : mockPage<Todo>([parent, child]),
    )
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Done parent')).toBeInTheDocument())

    await user.click(screen.getByTitle('todos.hideCompleted'))
    // The done grid is gone. The parent's title may still appear in the
    // child's "nested under" card hint — that hint is intentional — so the
    // grid header is the reliable witness that the done CARD is hidden.
    await waitFor(() => expect(screen.queryByText('已完成 (1)')).not.toBeInTheDocument())
    // The pending child stays visible as its own card.
    expect(screen.getByText('Kept child')).toBeInTheDocument()
  })

  it('hides completed subtask rows inside cards with the hide-completed toggle', async () => {
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'all')
    const parent = { id: 1, title: 'Working parent', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 2, completed_at: null, created_at: '', updated_at: '' } as Todo
    const doneSub = { id: 2, title: 'Done subtask', status: 'done', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, child_count: 0, completed_at: '2026-05-20', created_at: '', updated_at: '' } as Todo
    const openSub = { id: 3, title: 'Open subtask', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, child_count: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    mockedList.mockImplementation(async (params?: TodoListParams) =>
      params?.parent_id === 1
        ? mockPage<Todo>([doneSub, openSub])
        : mockPage<Todo>([parent, doneSub, openSub]),
    )
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Working parent')).toBeInTheDocument()
      expect(screen.getByText('Done subtask')).toBeInTheDocument()
      expect(screen.getByText('Open subtask')).toBeInTheDocument()
    })

    await user.click(screen.getByTitle('todos.hideCompleted'))
    // The done subtask row drops out of the card's section while the open
    // row and the parent card itself stay.
    await waitFor(() => expect(screen.queryByText('Done subtask')).not.toBeInTheDocument())
    expect(screen.getByText('Open subtask')).toBeInTheDocument()
    expect(screen.getByText('Working parent')).toBeInTheDocument()
  })

  it('hides the completed toggle on the Completed smart list', async () => {
    // The dedicated Completed list is all-done — hiding there would blank the
    // page, so the toggle is neither rendered nor applied.
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'completed')
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 2, title: 'Done task', status: 'done', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
    ]))
    renderPage()
    await waitFor(() => expect(screen.getByText('Done task')).toBeInTheDocument())
    expect(screen.queryByTitle('todos.hideCompleted')).not.toBeInTheDocument()
    expect(screen.queryByTitle('todos.showCompleted')).not.toBeInTheDocument()
  })

  it('hides the completed toggle on the Abandoned smart list', async () => {
    // Same rule as the Completed list: everything there is abandoned, so the
    // toggle would blank the page.
    localStorage.setItem('todoView', 'grouped')
    localStorage.setItem('todoSmartList', 'abandoned')
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 3, title: 'Dropped task', status: 'abandoned', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
    ]))
    renderPage()
    await waitFor(() => expect(screen.getByText('Dropped task')).toBeInTheDocument())
    expect(screen.queryByTitle('todos.hideCompleted')).not.toBeInTheDocument()
    expect(screen.queryByTitle('todos.showCompleted')).not.toBeInTheDocument()
  })

  it('renders todo with amount and priority', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 3, title: 'Team lunch', status: 'pending', priority: 'high', due_time: '2026-05-22T14:00:00+08:00', amount: 200, amount_type: 'expense', contact_ids: [], color: '#ff0000', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
    ]))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Team lunch')).toBeInTheDocument()
    })
    expect(screen.getAllByText('高').length).toBeGreaterThan(0)
  })

  it('filters by status when selecting the pending smart list', async () => {
    localStorage.setItem('todoView', 'grouped')
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    // Pick the "pending" smart list in the dropdown
    await user.selectOptions(screen.getByLabelText('todos.smartList'), 'pending')
    // The API should be called with the raw value 'pending', not the translated text
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', page: 1, page_size: 50 }),
      expect.any(AbortSignal),
    )
  })

  it('switches to kanban view showing columns', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 1, title: 'Task A', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
      { id: 2, title: 'Task B', status: 'done', priority: 'low', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
    ]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Task A')).toBeInTheDocument()
    })

    await user.click(screen.getByTitle('看板'))
    await waitFor(() => {
      // Cards render in their columns and the add-column entry exists.
      expect(screen.getByText('Task A')).toBeInTheDocument()
      expect(screen.getByText('Task B')).toBeInTheDocument()
      expect(screen.getByText('todos.kanbanAddColumn')).toBeInTheDocument()
    })
  })

  it('tree view lazily loads children on expand', async () => {
    localStorage.setItem('todoView', 'tree')
    const root = { id: 1, title: 'Root', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 1, sort_order: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    const child = { id: 2, title: 'Child', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, sort_order: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    // Param-aware mock: roots_only returns just the root; a parent_id query
    // returns that parent's children (lazy expand).
    mockedList.mockImplementation(async (params?: TodoListParams) =>
      params?.parent_id === 1
        ? mockPage<Todo>([child])
        : mockPage<Todo>([root]),
    )
    const user = userEvent.setup()
    renderPage()
    // Default view is tree; the root renders, the child is not fetched yet.
    await waitFor(() => expect(screen.getByText('Root')).toBeInTheDocument())
    expect(screen.queryByText('Child')).not.toBeInTheDocument()

    // Expanding the root fetches its children (parent_id=1).
    await user.click(screen.getByRole('button', { name: 'todos.expand' }))
    await waitFor(() => expect(screen.getByText('Child')).toBeInTheDocument())
  })

  it('tree view pins manual sort and hides the sort picker', async () => {
    localStorage.setItem('todoView', 'tree')
    const root = { id: 1, title: 'Root', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 0, sort_order: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    mockedList.mockImplementation(async () => mockPage<Todo>([root]))
    renderPage()
    await waitFor(() => expect(screen.getByText('Root')).toBeInTheDocument())

    // The tree always fetches manual/asc — even though the toolbar's default
    // sort is due_date — so a drop's new sort_order survives the refetch
    // instead of snapping back to its old slot.
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'manual', order: 'asc', roots_only: true }),
      expect.any(AbortSignal),
    )
    // Sort controls are meaningless in the outliner tree — they're hidden.
    expect(screen.queryByLabelText('todos.sort')).not.toBeInTheDocument()
    expect(screen.queryByTitle('todos.ascending')).not.toBeInTheDocument()
  })

  it('renames a child row in the tree view', async () => {
    localStorage.setItem('todoView', 'tree')
    // Regression: tree-view children live in per-parent slices, not in the
    // roots-only list — rename must still find them and persist the edit.
    const root = { id: 1, title: 'Root', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 1, sort_order: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    const child = { id: 2, title: 'Child task', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, sort_order: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    mockedList.mockImplementation(async (params?: TodoListParams) =>
      params?.parent_id === 1
        ? mockPage<Todo>([child])
        : mockPage<Todo>([root]),
    )
    mockedUpdate.mockResolvedValue({ data: child })
    localStorage.setItem('todoTreeExpanded', JSON.stringify([1]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Child task')).toBeInTheDocument())

    await user.dblClick(screen.getByRole('button', { name: 'Child task' }))
    const input = screen.getByDisplayValue('Child task')
    await user.clear(input)
    await user.type(input, 'Renamed child{Enter}')

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(2, expect.objectContaining({ title: 'Renamed child' }))
    })
  })

  it('opens the detail drawer on single title click (double-click still renames)', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([
      { id: 1, title: 'Buy milk', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
    ]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Buy milk')).toBeInTheDocument()
    })

    // Single click opens the right-side drawer (fires after the 250ms
    // double-click disambiguation window).
    await user.click(screen.getByText('Buy milk'))
    await waitFor(() => {
      expect(screen.getByText('common.save')).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('creates a todo via the quick-add bar on Enter', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('todos.quickAdd')
    await user.type(input, 'Quick task{Enter}')

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Quick task' }))
    })
  })

  it('parses a natural-language date from the quick-add bar', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('todos.quickAdd')
    await user.type(input, 'Ship feature tomorrow{Enter}')

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Ship feature',
        due_time: expect.any(String),
      }))
    })
  })

  it('assigns an existing #tag from the quick-add bar', async () => {
    const user = userEvent.setup()
    mockedTagsList.mockResolvedValue(mockAxios<PaginatedData<Tag>>({
      items: [{ id: 5, user_id: 1, name: 'work', color: '', created_at: '' }],
      total: 1, page: 1, page_size: 200,
    }))
    mockedCreate.mockResolvedValue({ data: { id: 42, title: 'task' } as Todo })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('todos.quickAdd')
    await user.type(input, 'Email her #work{Enter}')

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Email her' }))
      expect(mockedReplaceTags).toHaveBeenCalledWith(42, [5])
    })
  })

  it('opens the keyboard shortcuts help from the overflow menu', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'common.more' }))
    await user.click(await screen.findByText('todos.shortcuts'))

    await waitFor(() => {
      expect(screen.getByText('todos.gotIt')).toBeInTheDocument()
    })
  })

  it('enters selection mode from the overflow menu and shows the bulk action bar', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'common.more' }))
    await user.click(await screen.findByText('todos.select'))

    await waitFor(() => {
      expect(screen.getByText('todos.bulkComplete')).toBeInTheDocument()
      expect(screen.getByText('todos.bulkDelete')).toBeInTheDocument()
    })
  })

  it('switches to the Today smart list (sets due range)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText('todos.smartList'), 'today')

    await waitFor(() => {
      // "Today" includes overdue: pending + an upper due bound, no lower bound.
      expect(mockedList).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', due_before: expect.any(String) }),
        expect.any(AbortSignal),
      )
    })
  })

  it('renders a parent subtasks on the Today list via unfiltered children queries', async () => {
    // Regression: flat views used to build subtask sections from the FILTERED
    // list — an undated subtask under a "today" parent never matched, so the
    // section rendered empty. Like the tree/drawer, children must come from
    // per-parent queries without the smart-list filters.
    localStorage.setItem('todoView', 'grouped')
    const parent = { id: 1, title: 'Dated parent', status: 'pending', priority: 'normal', due_time: '2026-05-20T10:00:00+08:00', amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 1, completed_at: null, created_at: '', updated_at: '' } as Todo
    const child = { id: 2, title: 'Undated child', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, child_count: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    mockedList.mockImplementation(async (params?: TodoListParams) =>
      params?.parent_id === 1
        ? mockPage<Todo>([child])
        : mockPage<Todo>([parent]),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText('Dated parent')).toBeInTheDocument())
    // The undated child does not match the today filter but still renders in
    // the parent's subtask section.
    await waitFor(() => expect(screen.getByText('Undated child')).toBeInTheDocument())

    // The children query carries ONLY sort/order + parent_id — no smart-list
    // filters — so every subtask shows under its parent.
    const childCall = mockedList.mock.calls.find(([p]) => p?.parent_id === 1)
    expect(childCall).toBeDefined()
    expect(childCall?.[0]).not.toHaveProperty('status')
    expect(childCall?.[0]).not.toHaveProperty('due_before')
  })

  it('shows a subtask added inline on the Today list right after creating it', async () => {
    // Regression for the reported bug: adding a subtask on a filtered smart
    // list looked broken — the child was created server-side but never
    // appeared, because the refetched list filtered it out.
    localStorage.setItem('todoView', 'grouped')
    const parent = { id: 1, title: 'Today parent', status: 'pending', priority: 'normal', due_time: '2026-05-20T10:00:00+08:00', amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: null, child_count: 0, completed_at: null, created_at: '', updated_at: '' } as Todo
    // Server-side state the create mutation grows, mirrored into both mock
    // branches (children slice + the parent's child_count).
    let children: Todo[] = []
    mockedList.mockImplementation(async (params?: TodoListParams) =>
      params?.parent_id === 1
        ? mockPage<Todo>(children)
        : mockPage<Todo>([{ ...parent, child_count: children.length }]),
    )
    mockedCreate.mockImplementation(async () => {
      children = [{ id: 2, title: 'Fresh subtask', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, parent_id: 1, child_count: 0, completed_at: null, created_at: '', updated_at: '' } as Todo]
      return { data: children[0] }
    })
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Today parent')).toBeInTheDocument())

    // Open the subtask section's trailing adder. It shares its accessible
    // name with the icon-only toolbar button, so tell them apart by content.
    const adderButtons = screen.getAllByRole('button', { name: 'todos.addChild' })
    const trailingAdder = adderButtons.find((b) => b.textContent === 'todos.addChild')
    expect(trailingAdder).toBeDefined()
    await user.click(trailingAdder!)
    const input = screen.getByPlaceholderText('todos.addSubtaskPlaceholder')
    fireEvent.change(input, { target: { value: 'Fresh subtask' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // handleCreateChild awaits the mutation, so the call lands a tick later.
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fresh subtask', parent_id: 1 }))
    })
    await waitFor(() => expect(screen.getByText('Fresh subtask')).toBeInTheDocument())
  })
})
