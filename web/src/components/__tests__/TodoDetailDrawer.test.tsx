import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoDetailDrawer } from '../TodoDetailDrawer'
import type { Todo } from '../../types'

const mocks = vi.hoisted(() => ({
  updateTodo: vi.fn(),
  createTodo: vi.fn(),
  replaceTags: vi.fn(),
  moveTodo: vi.fn(),
  childrenMap: vi.fn(() => new Map()),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useCreateTodo: () => ({ mutateAsync: mocks.createTodo, isPending: false }),
  useUpdateTodo: () => ({ mutateAsync: mocks.updateTodo, isPending: false }),
  useReplaceTodoTags: () => ({ mutateAsync: mocks.replaceTags }),
  useMoveTodo: () => ({ mutateAsync: mocks.moveTodo, isPending: false }),
  useTodoItems: () => ({ data: [] }),
  // Drawer subtask area: empty children slices by default.
  // Drawer subtask area: empty children slices by default (overridable).
  useTodoChildrenMap: () => mocks.childrenMap(),  useCreateTodoItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleTodoItem: () => ({ mutateAsync: vi.fn() }),
  useDeleteTodoItem: () => ({ mutateAsync: vi.fn() }),
  useUpdateTodoItem: () => ({ mutateAsync: vi.fn() }),
  useReorderTodoItem: () => ({ mutateAsync: vi.fn() }),
  usePromoteTodoItem: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../api/contacts', () => ({
  contactsApi: { list: vi.fn() },
}))

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 7, user_id: 1, workspace_id: 1, title: 'Drawer task', description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...over,
  }
}

describe('TodoDetailDrawer', () => {
  beforeEach(() => {
    mocks.updateTodo.mockReset()
    mocks.createTodo.mockReset()
    mocks.replaceTags.mockReset()
    mocks.moveTodo.mockReset()
    mocks.childrenMap.mockReset()
    mocks.childrenMap.mockReturnValue(new Map())
  })

  it('shows the todo title in the header and pre-fills the form', () => {
    render(
      <TodoDetailDrawer
        todo={todo()}
        open
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    // Header carries the todo title; the title field is pre-filled for editing.
    expect(screen.getAllByText('Drawer task').length).toBeGreaterThan(0)
    const titleInput = document.querySelector('input') as HTMLInputElement
    expect(titleInput.value).toBe('Drawer task')
    expect(screen.getByText('common.save')).toBeInTheDocument()
  })

  it('saves edits through the shared form', async () => {
    const user = userEvent.setup()
    render(
      <TodoDetailDrawer
        todo={todo()}
        open
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByText('common.save'))
    expect(mocks.updateTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
  })

  it('renders the subtask subtree and toggles a subtask', async () => {
    const user = userEvent.setup()
    const sub = { ...todo({ id: 8, title: 'Deep subtask', parent_id: 7 }) }
    mocks.childrenMap.mockReturnValue(new Map([[7, { items: [sub], total: 1, loaded: true, hasMore: false, loadMore: vi.fn() }]]))
    const onToggleSubtask = vi.fn()
    render(
      <TodoDetailDrawer
        todo={todo()}
        open
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
        onToggleSubtask={onToggleSubtask}
      />,
    )
    // Subtask area lists the child (to any depth via the recursive loader).
    expect(screen.getByText('Deep subtask')).toBeInTheDocument()
    await user.click(screen.getAllByLabelText('todos.markDone')[0])
    expect(onToggleSubtask).toHaveBeenCalledWith(sub)
  })

  it('renders nothing when no todo is set', () => {
    const { container } = render(
      <TodoDetailDrawer
        todo={null}
        open={false}
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
