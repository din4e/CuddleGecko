import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import TodosPage from '../TodosPage'

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

vi.mock('../../api/todo', () => ({
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toggleStatus: vi.fn(),
    syncToEvent: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../api/contacts', () => ({
  contactsApi: {
    list: vi.fn(),
  },
}))

import { todoApi } from '../../api/todo'
import { contactsApi } from '../../api/contacts'

const mockedList = vi.mocked(todoApi.list)
const mockedContactsList = vi.mocked(contactsApi.list)

function renderPage() {
  return render(
    <BrowserRouter>
      <TodosPage />
    </BrowserRouter>,
  )
}

describe('TodosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue({ data: [] })
    mockedContactsList.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 100 } })
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
      expect(screen.getByText('全部')).toBeInTheDocument()
      expect(screen.getByText('新建待办')).toBeInTheDocument()
    })
  })

  it('renders todo items from API', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 1, title: 'Buy milk', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
      ],
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Buy milk')).toBeInTheDocument()
      expect(screen.getByText('普通')).toBeInTheDocument()
    })
  })

  it('renders done todo with completed section', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 2, title: 'Done task', status: 'done', priority: 'low', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
      ],
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Done task')).toBeInTheDocument()
      expect(screen.getByText('已完成 (1)')).toBeInTheDocument()
    })
  })

  it('renders todo with amount and priority', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 3, title: 'Team lunch', status: 'pending', priority: 'high', due_time: '2026-05-22T14:00:00+08:00', amount: 200, amount_type: 'expense', contact_ids: [], color: '#ff0000', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
      ],
    })
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

    // Click the "pending" status filter button (translates to '待办状态')
    await user.click(screen.getByText('待办状态'))
    // The API should be called with the raw value 'pending', not the translated text
    expect(mockedList).toHaveBeenCalledWith('pending')
  })

  it('switches to kanban view showing columns', async () => {
    mockedList.mockResolvedValue({
      data: [
        { id: 1, title: 'Task A', status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: null, created_at: '', updated_at: '' },
        { id: 2, title: 'Task B', status: 'done', priority: 'low', due_time: null, amount: null, amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1, completed_at: '2026-05-20', created_at: '', updated_at: '' },
      ],
    })
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
