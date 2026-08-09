import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoCard from '../TodoCard'
import type { TodoCardProps } from '../TodoCard'
import type { Todo } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    user_id: 1,
    workspace_id: 1,
    title: 'Buy milk',
    description: '',
    status: 'pending',
    priority: 'normal',
    due_time: null,
    amount: null,
    amount_type: '',
    contact_ids: [],
    color: '',
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

type Handlers = Pick<TodoCardProps, 'onToggle' | 'onTogglePin' | 'onSync' | 'onEdit' | 'onRename' | 'onDuplicate' | 'onDelete'>

function renderCard(overrides: Partial<Todo> = {}, handlers: Partial<Handlers> = {}) {
  const props: TodoCardProps = {
    todo: makeTodo(overrides),
    contactNames: '',
    onToggle: handlers.onToggle ?? vi.fn(),
    onTogglePin: handlers.onTogglePin ?? vi.fn(),
    onSync: handlers.onSync ?? vi.fn(),
    onEdit: handlers.onEdit ?? vi.fn(),
    onRename: handlers.onRename ?? vi.fn(),
    onDuplicate: handlers.onDuplicate ?? vi.fn(),
    onDelete: handlers.onDelete ?? vi.fn(),
    formatDate: () => 'Jan 1',
  }
  return { props, ...render(<TodoCard {...props} />) }
}

describe('TodoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title and priority label', () => {
    renderCard({ title: 'Buy milk', priority: 'high' })
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    // priority label is t(`todos.${priority}`) -> raw key
    expect(screen.getByText('todos.high')).toBeInTheDocument()
  })

  it('shows the parent title hint when nested', () => {
    render(
      <TodoCard
        todo={makeTodo({ title: 'Child' })}
        contactNames=""
        onToggle={vi.fn()}
        onTogglePin={vi.fn()}
        onSync={vi.fn()}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        formatDate={() => 'Jan 1'}
        parentTitle="Parent task"
      />,
    )
    expect(screen.getByText('Parent task')).toBeInTheDocument()
  })

  it('clicking the status circle calls onToggle', async () => {
    const onToggle = vi.fn()
    renderCard({}, { onToggle })
    await userEvent.click(screen.getByRole('button', { name: 'todos.markDone' }))
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('double-click title edits inline; Enter commits via onRename', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    renderCard({ title: 'Original' }, { onRename })

    await user.dblClick(screen.getByText('Original'))
    const input = screen.getByDisplayValue('Original')
    await user.clear(input)
    await user.type(input, 'New title{Enter}')

    expect(onRename).toHaveBeenCalledWith(1, 'New title')
  })

  it('Escape cancels inline edit without renaming', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    renderCard({ title: 'Original' }, { onRename })

    await user.dblClick(screen.getByText('Original'))
    await user.type(screen.getByDisplayValue('Original'), 'x{Escape}')

    expect(onRename).not.toHaveBeenCalled()
  })

  it('the star button calls onTogglePin', async () => {
    const onTogglePin = vi.fn()
    renderCard({}, { onTogglePin })
    await userEvent.click(screen.getByRole('button', { name: 'todos.pinAria' }))
    expect(onTogglePin).toHaveBeenCalledWith(makeTodo())
  })

  it('the copy button calls onDuplicate', async () => {
    const onDuplicate = vi.fn()
    renderCard({}, { onDuplicate })
    await userEvent.click(screen.getByRole('button', { name: 'todos.duplicate' }))
    expect(onDuplicate).toHaveBeenCalledWith(makeTodo())
  })

  it('the selection checkbox calls onSelectToggle', async () => {
    const onSelectToggle = vi.fn()
    render(
      <TodoCard
        todo={makeTodo()}
        contactNames=""
        selectable
        onSelectToggle={onSelectToggle}
        onToggle={vi.fn()}
        onTogglePin={vi.fn()}
        onSync={vi.fn()}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        formatDate={() => 'Jan 1'}
      />,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Buy milk' }))
    expect(onSelectToggle).toHaveBeenCalledWith(1)
  })
})
