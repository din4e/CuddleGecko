import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TodosPage from '../TodosPage'
import type { Todo, Contact, PaginatedData } from '../../types'

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
        'todos.syncToEvent': '同步到事件',
        'todos.deleteConfirm': '确定删除此待办？',
        'common.cancel': '取消',
        'common.create': '创建',
      }
      return translations[key] || key
    },
    i18n: { language: 'zh' },
  }),
}))

vi.mock('../../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toggleStatus: vi.fn(),
    syncToEvent: vi.fn(),
    delete: vi.fn(),
    getTags: vi.fn(),
    setTags: vi.fn(),
    listLists: vi.fn(),
    createList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    listItems: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    toggleItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}))

vi.mock('../../api/tags', () => ({
  tagsApi: {
    list: vi.fn(),
  },
}))

vi.mock('../../api/contacts', () => ({
  contactsApi: {
    list: vi.fn(),
  },
}))

import { todosApi } from '../../api/todos'
import { tagsApi } from '../../api/tags'
import { contactsApi } from '../../api/contacts'
import type { AxiosResponse } from 'axios'

const mockedList = vi.mocked(todosApi.list)
const mockedContactsList = vi.mocked(contactsApi.list)
const mockedTagsList = vi.mocked(tagsApi.list)
const mockedLists = vi.mocked(todosApi.listLists)

function baseTodo(over: Partial<Todo>): Todo {
  return {
    id: 1, title: '', status: 'pending', priority: 'normal', due_time: null,
    amount: null, amount_type: '', contact_ids: [], color: '', description: '',
    user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '',
    list_id: null, repeat_rule: '', repeat_every: 0, repeat_until: null, tags: [], items: [],
    ...over,
  }
}

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
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    mockedList.mockResolvedValue(mockPage<Todo>([]))
    mockedLists.mockResolvedValue({ data: [] })
    mockedTagsList.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 100 } })
    mockedContactsList.mockResolvedValue(mockAxios<PaginatedData<Contact>>({ items: [], total: 0, page: 1, page_size: 100 }))
  })

  it('renders empty state', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })
  })

  it('renders page title and controls', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('待办')).toBeInTheDocument()
      expect(screen.getAllByText('全部').length).toBeGreaterThan(0)
      expect(screen.getByText('新建待办')).toBeInTheDocument()
    })
  })

  it('renders todo items from API', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([baseTodo({ id: 1, title: 'Buy milk', priority: 'normal' })]))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Buy milk')).toBeInTheDocument()
      expect(screen.getByText('普通')).toBeInTheDocument()
    })
  })

  it('renders done todo with completed section', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([baseTodo({ id: 2, title: 'Done task', status: 'done', priority: 'low', completed_at: '2026-05-20' })]))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Done task')).toBeInTheDocument()
      expect(screen.getByText('已完成 (1)')).toBeInTheDocument()
    })
  })

  it('renders todo with amount and priority', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([baseTodo({
      id: 3, title: 'Team lunch', status: 'pending', priority: 'high',
      due_time: '2026-05-22T14:00:00+08:00', amount: 200, amount_type: 'expense', color: '#ff0000',
    })]))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Team lunch')).toBeInTheDocument()
      expect(screen.getByText('高')).toBeInTheDocument()
    })
  })

  it('filters by status when clicking pending button', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('暂无待办')).toBeInTheDocument()
    })

    await user.click(screen.getByText('待办状态'))
    expect(mockedList).toHaveBeenCalledWith(
      { status: 'pending', list_id: undefined, tag_ids: undefined, page: 1, page_size: 50 },
      expect.any(AbortSignal),
    )
  })

  it('switches to kanban view showing columns', async () => {
    mockedList.mockResolvedValue(mockPage<Todo>([
      baseTodo({ id: 1, title: 'Task A', status: 'pending' }),
      baseTodo({ id: 2, title: 'Task B', status: 'done', completed_at: '2026-05-20' }),
    ]))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Task A')).toBeInTheDocument()
    })

    await user.click(screen.getByTitle('看板'))
    await waitFor(() => {
      expect(screen.getByText(/待办状态 \(1\)/)).toBeInTheDocument()
      expect(screen.getByText(/已完成 \(1\)/)).toBeInTheDocument()
    })
  })
})
