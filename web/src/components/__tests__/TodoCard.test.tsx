import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoCard from '../TodoCard'
import type { TodoCardProps } from '../TodoCard'
import { useTodoCollapseStore } from '../../stores/todoCollapse'
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
    // Subtask fold state lives in a persisted shared store — reset it so
    // folds made here (or in sibling test files) don't leak between cases.
    useTodoCollapseStore.setState({ collapsed: new Set() })
  })

  it('renders the title and priority label', () => {
    renderCard({ title: 'Buy milk', priority: 'high' })
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    // priority label is t(`todos.${priority}`) -> raw key
    expect(screen.getByText('todos.high')).toBeInTheDocument()
  })

  it('renders the description preview as inline markdown', () => {
    renderCard({ description: '**bold** and `code` note' })
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
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

  it('the small-screen kebab menu carries the same actions', async () => {
    const onDelete = vi.fn()
    renderCard({}, { onDelete })
    // Both surfaces render; CSS decides which is visible by breakpoint.
    await userEvent.click(screen.getByRole('button', { name: 'common.more' }))
    // The menu item shows the action's label as text (the toolbar buttons
    // only carry it as aria-label), so this targets the menu entry.
    await userEvent.click(await screen.findByText('todos.deleteAria'))
    expect(onDelete).toHaveBeenCalledWith(makeTodo())
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

  it('the progress chip folds and unfolds the subtask list (non-compact)', async () => {
    const user = userEvent.setup()
    const base = {
      contactNames: '',
      onToggle: vi.fn(),
      onTogglePin: vi.fn(),
      onSync: vi.fn(),
      onEdit: vi.fn(),
      onRename: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      formatDate: () => 'Jan 1',
    }
    render(
      <TodoCard
        {...base}
        todo={makeTodo()}
        subtasks={<div data-testid="subtask-list">list</div>}
        subtaskProgress={{ done: 1, total: 2 }}
      />,
    )
    expect(screen.getByTestId('subtask-list')).toBeInTheDocument()
    // Accessible name comes from the chip's content: done/total.
    await user.click(screen.getByRole('button', { name: '1/2' }))
    expect(screen.queryByTestId('subtask-list')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '1/2' }))
    expect(screen.getByTestId('subtask-list')).toBeInTheDocument()
  })

  it('a stale fold never hides the add-subtask entry of a childless todo', () => {
    useTodoCollapseStore.setState({ collapsed: new Set(['page:1']) })
    render(
      <TodoCard
        todo={makeTodo()}
        contactNames=""
        onToggle={vi.fn()}
        onTogglePin={vi.fn()}
        onSync={vi.fn()}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        formatDate={() => 'Jan 1'}
        subtasks={<div data-testid="subtask-list">list</div>}
      />,
    )
    // No subtaskProgress (total 0) → the fold is ignored and the section —
    // whose only content is the "add child" entry — stays visible.
    expect(screen.getByTestId('subtask-list')).toBeInTheDocument()
  })

  it('a subtask drag dropped on the card body nests under it', () => {
    const onNestSubtask = vi.fn()
    const props = {
      contactNames: '',
      onToggle: vi.fn(),
      onTogglePin: vi.fn(),
      onSync: vi.fn(),
      onEdit: vi.fn(),
      onRename: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      formatDate: () => 'Jan 1',
      subtasks: <div data-testid="subtask-list">list</div>,
      subtaskDragId: 7 as number | null,
      onNestSubtask,
    }
    render(<TodoCard {...props} todo={makeTodo()} />)
    const card = screen.getByText('Buy milk').closest('[data-slot="card"]')!
    fireEvent.dragOver(card, { dataTransfer: dtStub() })
    fireEvent.drop(card, { dataTransfer: dtStub() })
    expect(onNestSubtask).toHaveBeenCalledWith(7, 1)
  })

  it('ignores a subtask drop of the card onto itself', () => {
    const onNestSubtask = vi.fn()
    render(
      <TodoCard
        todo={makeTodo()}
        contactNames=""
        onToggle={vi.fn()}
        onTogglePin={vi.fn()}
        onSync={vi.fn()}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        formatDate={() => 'Jan 1'}
        subtaskDragId={1}
        onNestSubtask={onNestSubtask}
      />,
    )
    const card = screen.getByText('Buy milk').closest('[data-slot="card"]')!
    fireEvent.drop(card, { dataTransfer: dtStub() })
    expect(onNestSubtask).not.toHaveBeenCalled()
  })
})

// jsdom has no DataTransfer; the card handlers only assign dropEffect.
const dtStub = () => ({ effectAllowed: '', dropEffect: '', setData: vi.fn() })
