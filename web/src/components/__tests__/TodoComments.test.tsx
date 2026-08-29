import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoComments } from '../TodoComments'
import type { TodoComment } from '../../types'

const mocks = vi.hoisted(() => ({
  comments: [] as TodoComment[],
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useTodoComments: () => ({ data: mocks.comments, isPending: false }),
  useCreateTodoComment: () => ({ mutate: mocks.createComment, isPending: false }),
  useUpdateTodoComment: () => ({ mutate: mocks.updateComment, isPending: false }),
  useDeleteTodoComment: () => ({ mutate: mocks.deleteComment, isPending: false }),
}))

vi.mock('../../stores/auth', () => ({
  useAuthStore: (sel: (s: { user: { id: number } | null }) => unknown) => sel({ user: { id: 1 } }),
}))

function comment(over: Partial<TodoComment> = {}): TodoComment {
  return {
    id: 11, todo_id: 7, user_id: 1, username: 'alice',
    content: 'hello **world**', created_at: '2026-08-29T10:00:00Z', updated_at: '2026-08-29T10:00:00Z',
    ...over,
  }
}

describe('TodoComments', () => {
  beforeEach(() => {
    mocks.comments = []
    mocks.createComment.mockReset()
    mocks.updateComment.mockReset()
    mocks.deleteComment.mockReset()
  })

  it('renders each note with author and markdown content', () => {
    mocks.comments = [comment(), comment({ id: 12, user_id: 2, username: 'bob', content: 'plain note' })]
    render(<TodoComments todoId={7} />)
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    // Markdown is rendered (strong tag), not shown raw.
    expect(document.querySelector('strong')).toHaveTextContent('world')
  })

  it('submits a trimmed note and clears the draft', async () => {
    const user = userEvent.setup()
    mocks.createComment.mockImplementation((_c: string, opts: { onSuccess: () => void }) => opts.onSuccess())
    render(<TodoComments todoId={7} />)
    await user.type(screen.getByPlaceholderText('todos.commentPlaceholder'), '  hi there  ')
    await user.click(screen.getByText('todos.commentSubmit'))
    expect(mocks.createComment).toHaveBeenCalledWith('hi there', expect.anything())
    await waitFor(() => expect(screen.getByPlaceholderText('todos.commentPlaceholder')).toHaveValue(''))
  })

  it('lets the author edit only their own notes', async () => {
    const user = userEvent.setup()
    mocks.comments = [comment(), comment({ id: 12, user_id: 2, username: 'bob' })]
    render(<TodoComments todoId={7} />)
    // Two rows, but only the author's own note offers edit (and delete).
    const editButtons = screen.getAllByLabelText('todos.commentEdit')
    expect(editButtons).toHaveLength(1)
    expect(screen.getAllByLabelText('todos.commentDelete')).toHaveLength(1)
    await user.click(editButtons[0])
    // Two textboxes exist (composer + the edit draft); the edit one is
    // pre-filled with the note's original content.
    const textboxes = screen.getAllByRole('textbox') as HTMLTextAreaElement[]
    const textbox = textboxes.find((el) => el.value === 'hello **world**')
    expect(textbox).toBeTruthy()
    await user.clear(textbox!)
    await user.type(textbox!, 'edited body')
    mocks.updateComment.mockImplementation((_a: unknown, opts: { onSuccess: () => void }) => opts.onSuccess())
    await user.click(screen.getByText('common.save'))
    expect(mocks.updateComment).toHaveBeenCalledWith({ commentId: 11, content: 'edited body' }, expect.anything())
  })
})
