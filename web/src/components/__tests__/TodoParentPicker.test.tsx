import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodoParentPicker from '../TodoParentPicker'
import type { Todo } from '../../types'

// Node's global localStorage is undefined in tests; rootKey reads it at call
// time for query keys (the list hook runs on mount).
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useTodosList: (params: Record<string, unknown>, options?: { enabled?: boolean }) => mocks.list(params, options),
  useTodo: (id: string | null) => mocks.get(id),
}))

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: '1', user_id: '1', workspace_id: '1', title: 'Task', description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...over,
  }
}

describe('TodoParentPicker', () => {
  beforeEach(() => {
    mocks.list.mockReset()
    mocks.list.mockReturnValue({ data: undefined, isFetching: false })
    mocks.get.mockReset()
    mocks.get.mockReturnValue({ data: undefined })
  })

  it('shows the parent title fetched by id when it is not among loaded candidates', async () => {
    // The regression this guards: a parent outside the current view used to
    // render as a bare "#id" with no name.
    mocks.get.mockReturnValue({ data: todo({ id: '42', title: 'Unloaded parent' }) })

    render(<TodoParentPicker value={'42'} onChange={vi.fn()} candidates={[]} blocked={new Set()} />)

    expect(mocks.get).toHaveBeenCalledWith('42')
    expect(await screen.findByText('Unloaded parent')).toBeInTheDocument()
  })

  it('falls back to the bare id only while the parent is unresolved', () => {
    render(<TodoParentPicker value={'42'} onChange={vi.fn()} candidates={[]} blocked={new Set()} />)

    expect(screen.getByRole('button', { name: 'todos.parent' })).toHaveTextContent('#42')
  })

  it('does not fetch a parent that is already in the candidates', () => {
    render(
      <TodoParentPicker
        value={'5'}
        onChange={vi.fn()}
        candidates={[todo({ id: '5', title: 'Local parent' })]}
        blocked={new Set()}
      />,
    )

    expect(mocks.get).toHaveBeenCalledWith(null)
    expect(screen.getByRole('button', { name: 'todos.parent' })).toHaveTextContent('Local parent')
  })

  it('does not fetch when no parent is set', () => {
    render(<TodoParentPicker value={null} onChange={vi.fn()} candidates={[todo()]} blocked={new Set()} />)

    expect(mocks.get).toHaveBeenCalledWith(null)
    expect(screen.getByRole('button', { name: 'todos.parent' })).toHaveTextContent('todos.parentNone')
  })
})
