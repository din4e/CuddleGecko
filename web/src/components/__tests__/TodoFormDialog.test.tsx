import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoFormDialog } from '../TodoFormDialog'
import type { Todo } from '../../types'

const mocks = vi.hoisted(() => ({
  updateTodo: vi.fn(),
  createTodo: vi.fn(),
  replaceTags: vi.fn(),
  moveTodo: vi.fn(),
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
  useCreateTodoItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    id: 1, user_id: 1, workspace_id: 1, title: 'Task', description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...over,
  }
}

describe('TodoFormDialog', () => {
  beforeEach(() => {
    mocks.updateTodo.mockReset()
    mocks.createTodo.mockReset()
    mocks.replaceTags.mockReset()
    mocks.moveTodo.mockReset()
  })

  it('clearing a populated due time on edit sends clear_due_time', async () => {
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={todo({ due_time: '2026-05-01T09:00:00.000Z' }) }
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const dueInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    await user.clear(dueInput)
    await user.click(screen.getByText('common.create'))

    expect(mocks.updateTodo).toHaveBeenCalledTimes(1)
    const arg = mocks.updateTodo.mock.calls[0][0] as { data: { clear_due_time?: boolean } }
    expect(arg.data.clear_due_time).toBe(true)
  })

  it('opens with an empty title for a new todo', () => {
    render(
      <TodoFormDialog
        open
        editing={null}
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const titleInput = document.querySelector('input') as HTMLInputElement
    expect(titleInput).not.toBeNull()
    expect(titleInput.value).toBe('')
  })

  it('create with a preset parent includes parent_id in the payload', async () => {
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={null}
        contacts={[]}
        tags={[]}
        parentCandidates={[todo({ id: 5, title: 'Parent' })]}
        presetParentId={5}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const titleInput = document.querySelector('input') as HTMLInputElement
    await user.type(titleInput, 'child')
    await user.click(screen.getByText('common.create'))

    expect(mocks.createTodo).toHaveBeenCalledTimes(1)
    const payload = mocks.createTodo.mock.calls[0][0] as Partial<Todo>
    expect(payload.parent_id).toBe(5)
  })

  it('edit without changing parent does not call move', async () => {
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={todo({ parent_id: 5 })}
        contacts={[]}
        tags={[]}
        parentCandidates={[todo({ id: 5, title: 'Parent' })]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByText('common.create'))

    expect(mocks.updateTodo).toHaveBeenCalledTimes(1)
    expect(mocks.moveTodo).not.toHaveBeenCalled()
  })
})
