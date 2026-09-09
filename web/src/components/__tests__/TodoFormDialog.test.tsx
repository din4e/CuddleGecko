import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as renderUI, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { TodoFormDialog } from '../TodoFormDialog'
import type { Tag, Todo } from '../../types'

// Node's global localStorage is undefined in tests; rootKey reads it at call
// time for query keys (the label picker's search hook runs on mount).
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

const mocks = vi.hoisted(() => ({
  updateTodo: vi.fn(),
  createTodo: vi.fn(),
  replaceTags: vi.fn(),
  moveTodo: vi.fn(),
  list: vi.fn<(params?: unknown, options?: unknown) => { data: { items: Todo[]; total: number; page: number; page_size: number } | undefined; isFetching: boolean }>(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useCreateTodo: () => ({ mutateAsync: mocks.createTodo, isPending: false }),
  useUpdateTodo: () => ({ mutateAsync: mocks.updateTodo, isPending: false }),
  useReplaceTodoTags: () => ({ mutateAsync: mocks.replaceTags }),
  useMoveTodo: () => ({ mutateAsync: mocks.moveTodo, isPending: false }),
  // Parent picker search: no results by default (overridable per test).
  useTodosList: (params: Record<string, unknown>, options?: { enabled?: boolean }) => mocks.list(params, options),
}))

vi.mock('../../api/contacts', () => ({
  contactsApi: { list: vi.fn() },
}))

function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return renderUI(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

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
    mocks.list.mockReset()
    mocks.list.mockReturnValue({ data: undefined, isFetching: false })
  })

  it('finds a parent through the searchable picker and reparents on save', async () => {
    // Local candidates are empty — the parent only exists server-side, found
    // through the q search (exactly the case the picker exists for).
    mocks.list.mockReturnValue({
      data: { items: [todo({ id: 7, title: 'Deep parent' })], total: 1, page: 1, page_size: 20 },
      isFetching: false,
    })
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={todo({ id: 1, parent_id: null })}
        contacts={[]}
        tags={[]}
        parentCandidates={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // Closed state shows "no parent"; clicking opens the search input.
    await user.click(screen.getByRole('button', { name: 'todos.parent' }))
    const input = screen.getByLabelText('todos.parent')
    await user.type(input, 'deep')

    // Debounced server search fires with the typed query…
    await waitFor(() => {
      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'deep', page_size: 20 }),
        expect.objectContaining({ enabled: true }),
      )
    })
    // …and its result is offered as an option; picking it closes the picker.
    await user.click(await screen.findByText('Deep parent'))
    await user.click(screen.getByText('common.save'))

    // Save kept the title payload intact and reparented via the move endpoint.
    expect(mocks.updateTodo).toHaveBeenCalledTimes(1)
    expect(mocks.moveTodo).toHaveBeenCalledWith({ id: 1, parentId: 7, afterId: null })
  })

  it('keeps the parent unchanged when the picker is never touched', async () => {
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={todo({ parent_id: 5 })}
        contacts={[]}
        tags={[]}
        parentCandidates={[todo({ id: 5, title: 'Current parent' })]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByText('common.save'))
    expect(mocks.moveTodo).not.toHaveBeenCalled()
  })

  it('clearing a populated due time on edit sends clear_due_time', async () => {
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={todo({ due_time: '2026-05-01T09:00:00.000Z' })}
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const dueInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    await user.clear(dueInput)
    await user.click(screen.getByText('common.save'))

    expect(mocks.updateTodo).toHaveBeenCalledTimes(1)
    const arg = mocks.updateTodo.mock.calls[0][0] as { data: { clear_due_time?: boolean } }
    expect(arg.data.clear_due_time).toBe(true)
  })

  it('sends the estimated duration on create', async () => {
    const user = userEvent.setup()
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
    // The duration field lives in the collapsible extras; open it first.
    await user.click(screen.getByText('todos.moreSettings'))
    const durationInput = document.querySelector('input[aria-label="todos.duration"]') as HTMLInputElement
    await user.type(durationInput, '45')
    await user.type(document.querySelector('input') as HTMLInputElement, 'Timed task')
    await user.click(screen.getByText('common.create'))

    expect(mocks.createTodo).toHaveBeenCalledTimes(1)
    expect(mocks.createTodo.mock.calls[0][0]).toMatchObject({ duration: 45, priority: 'none' })
  })

  it('clearing a populated duration on edit sends clear_duration', async () => {
    const user = userEvent.setup()
    render(
      <TodoFormDialog
        open
        editing={todo({ duration: 45 })}
        contacts={[]}
        tags={[]}
        onContactsChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const editDuration = document.querySelector('input[aria-label="todos.duration"]') as HTMLInputElement
    expect(editDuration.value).toBe('45')
    await user.clear(editDuration)
    await user.click(screen.getByText('common.save'))

    expect(mocks.updateTodo).toHaveBeenCalledTimes(1)
    const arg = mocks.updateTodo.mock.calls[0][0] as { data: { clear_duration?: boolean } }
    expect(arg.data.clear_duration).toBe(true)
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
    await user.click(screen.getByText('common.save'))

    expect(mocks.updateTodo).toHaveBeenCalledTimes(1)
    expect(mocks.moveTodo).not.toHaveBeenCalled()
  })
  it('keeps failed tag saves open and retries a created task without duplicating it', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.createTodo.mockResolvedValue({ data: todo({ id: 99 }) })
    mocks.replaceTags.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    render(<TodoFormDialog open editing={null} contacts={[]} tags={[{ id: 7, name: 'Work', color: '#22c55e' } as Tag]} onContactsChange={vi.fn()} onClose={onClose} />)
    await user.type(screen.getByLabelText('todos.title_field *'), 'New task')
    await user.click(screen.getByRole('button', { name: 'todos.labels' }))
    await user.click(screen.getByRole('option', { name: 'Work' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('common.create'))
    expect(await screen.findByRole('alert')).toHaveTextContent('todos.saveRetry')
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByText('common.create'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mocks.createTodo).toHaveBeenCalledTimes(1)
    expect(mocks.updateTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }))
    expect(mocks.replaceTags).toHaveBeenLastCalledWith({ todoId: 99, tagIds: [7] })
  })

  it('preserves existing labels when saving unrelated fields and can clear all labels', async () => {
    const user = userEvent.setup()
    const tag = { id: 250, name: 'Beyond first page', color: '#22c55e' } as Tag
    render(<TodoFormDialog open editing={todo({ tags: [tag] })} contacts={[]} tags={[]} onContactsChange={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByText('common.save'))
    expect(mocks.replaceTags).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'todos.labelsRemove' }))
    await user.click(screen.getByText('common.save'))
    await waitFor(() => expect(mocks.replaceTags).toHaveBeenCalledWith({ todoId: 1, tagIds: [] }))
  })

})
