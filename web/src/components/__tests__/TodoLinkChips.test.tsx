import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TodoLinkChips from '../TodoLinkChips'
import type { Todo } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

// rootKey reads localStorage at call time for query keys (todoDetailKey runs
// on mount through useTodoDetails).
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1, user_id: 1, workspace_id: 1, title: 'Target', description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...overrides,
  }
}

function renderChips(ids: number[], candidates: Todo[] = [], onOpen?: (id: number) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TodoLinkChips ids={ids} candidates={candidates} onOpen={onOpen} />
    </QueryClientProvider>,
  )
}

describe('TodoLinkChips', () => {
  it('renders one clickable chip per link, resolving titles from candidates', () => {
    const onOpen = vi.fn()
    const a = makeTodo({ id: 7, title: 'Write the report' })
    const b = makeTodo({ id: 9, title: 'Review the draft' })
    renderChips([7, 9], [a, b], onOpen)

    const chips = screen.getAllByRole('button', { name: 'todos.jumpToTodo' })
    expect(chips).toHaveLength(2)
    fireEvent.click(chips[0])
    expect(onOpen).toHaveBeenCalledWith(7)
    fireEvent.click(chips[1])
    expect(onOpen).toHaveBeenCalledWith(9)
  })

  it('strikes through settled targets', () => {
    const done = makeTodo({ id: 7, title: 'Already done', status: 'done' })
    renderChips([7], [done])
    expect(screen.getByText('Already done').className).toContain('line-through')
  })

  it('renders unresolved ids as dead references that are not clickable', async () => {
    const onOpen = vi.fn()
    renderChips([404], [], onOpen)
    // After the detail query settles (fails — no such todo), the chip turns
    // into a #404 hint — no button, no jump. (While pending it shows a spinner.)
    await waitFor(() => expect(screen.getByText('#404')).toBeInTheDocument())
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing for an empty link set', () => {
    const { container } = renderChips([])
    expect(container.textContent).toBe('')
  })
})
