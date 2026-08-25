import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import KanbanBoard from '../KanbanBoard'
import type { Todo, Tag } from '../../types'

// Node's global localStorage is undefined without --localstorage-file and
// shadows jsdom's — stub it like TodosPage.test does.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void store.set(key, value)),
    removeItem: vi.fn((key: string) => void store.delete(key)),
    clear: vi.fn(() => store.clear()),
  })
})

vi.mock('react-i18next', () => ({
  // Identity t(): assertions match raw i18n keys.
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const tags: Tag[] = [{ id: 1, name: 'work', color: '#3b82f6', user_id: 1, created_at: '' }]

function makeTodo(partial: Partial<Todo>): Todo {
  return {
    id: 1,
    title: 'task',
    description: '',
    status: 'pending',
    priority: 'normal',
    contact_ids: [],
    ...partial,
  } as Todo
}

const todos = [
  makeTodo({ id: 1, title: 'Buy milk', status: 'pending' }),
  makeTodo({ id: 2, title: 'Ship release', status: 'done' }),
  makeTodo({ id: 3, title: 'Unmatched', status: 'pending', priority: 'high' }),
]

const columns = [
  { id: 'status-pending', label: 'pending', kind: 'status' as const, value: 'pending' },
  { id: 'status-done', label: 'done', kind: 'status' as const, value: 'done' },
]

function renderBoard(props = {}) {
  return render(
    <KanbanBoard
      todos={todos}
      columns={columns}
      tags={tags}
      addColumn={vi.fn()}
      removeColumn={vi.fn()}
      onColumnsReorder={vi.fn()}
      renderCard={(todo) => <div>{todo.title}</div>}
      onCardDropColumn={vi.fn()}
      onReorder={vi.fn()}
      onCreateInColumn={vi.fn()}
      {...props}
    />,
  )
}

describe('KanbanBoard', () => {
  it('renders columns with badge counts and buckets todos', () => {
    renderBoard()
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    expect(screen.getByText('Ship release')).toBeInTheDocument()
    expect(screen.getByText('Unmatched')).toBeInTheDocument()
    expect(screen.getByText('todos.kanbanAddColumn')).toBeInTheDocument()
  })

  it('quick-creates in a column with the column predicate', async () => {
    const onCreateInColumn = vi.fn()
    renderBoard({ onCreateInColumn })
    const user = userEvent.setup()
    await user.click(screen.getAllByText('todos.kanbanAddCard')[0])
    const input = screen.getByPlaceholderText('todos.kanbanNewCardTitle')
    await user.type(input, 'New card{enter}')
    expect(onCreateInColumn).toHaveBeenCalledWith('New card', columns[0], undefined)
  })

  it('opens the add-column form and submits', async () => {
    const addColumn = vi.fn()
    renderBoard({ addColumn })
    const user = userEvent.setup()
    await user.click(screen.getByText('todos.kanbanAddColumn'))
    const label = screen.getByPlaceholderText('todos.kanbanColumnLabel')
    await user.type(label, 'High prio{enter}')
    expect(addColumn).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'High prio', kind: 'status', value: 'pending' }),
    )
  })

  it('renders swimlanes by priority when the saved mode is priority', () => {
    localStorage.setItem('kanbanSwimlaneMode', 'priority')
    renderBoard()
    expect(screen.getByText('todos.high')).toBeInTheDocument()
    expect(screen.getByText('todos.normal')).toBeInTheDocument()
    expect(screen.getByText('todos.low')).toBeInTheDocument()
    localStorage.removeItem('kanbanSwimlaneMode')
  })
})
