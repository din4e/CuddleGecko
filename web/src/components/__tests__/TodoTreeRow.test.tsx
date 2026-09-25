import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The tree rows themselves carry no data hooks anymore (the card body comes
// from renderCard) — the client wrapper stays for parity with the page.
const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
function renderWithClient(ui: React.ReactElement) {
  return render(<QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>)
}
import userEvent from '@testing-library/user-event'
import TodoTree from '../TodoTreeRow'
import type { TodoTreeHandlers, TreeCardExtras } from '../TodoTreeRow'
import type { Todo } from '../../types'
import type { TodoNode } from '../../lib/buildTodoTree'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

function makeTodo(id: number, overrides: Partial<Todo> = {}): Todo {
  return {
    id, user_id: 1, workspace_id: 1, title: `todo-${id}`, description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...overrides,
  }
}

const node = (todo: Todo, children: TodoNode[] = []): TodoNode => ({ todo, children })

// Card body stub: the real card is TodoCard (covered by the page tests); here
// it only needs to surface the title and render the tree's injected move
// actions so the row's sibling/depth math stays observable.
const renderCardStub = (todo: Todo, extras: TreeCardExtras) => (
  <div>
    <span>{todo.title}</span>
    {(extras.extraActions ?? []).map((a) => (
      <button key={a.key} type="button" onClick={a.onClick} disabled={a.disabled} aria-label={a.label}>
        {a.label}
      </button>
    ))}
  </div>
)

function handlers(overrides: Partial<TodoTreeHandlers> = {}): TodoTreeHandlers {
  return {
    expanded: new Set<number>(),
    onToggleExpand: vi.fn(),
    onMove: vi.fn(),
    renderCard: renderCardStub,
    ...overrides,
  }
}

describe('TodoTree', () => {
  it('renders roots and nested children', () => {
    const tree = [node(makeTodo(1), [node(makeTodo(2))])]
    renderWithClient(<TodoTree nodes={tree} {...handlers({ expanded: new Set([1]) })} />)
    expect(screen.getByText('todo-1')).toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
  })

  it('passes the node-derived subtree progress into the card', () => {
    const seen: Array<TreeCardExtras['subtaskProgress']> = []
    const tree = [node(makeTodo(1), [node(makeTodo(2, { status: 'done' }))])]
    renderWithClient(
      <TodoTree
        nodes={tree}
        {...handlers({
          expanded: new Set([1]),
          renderCard: (todo, extras) => {
            if (todo.id === 1) seen.push(extras.subtaskProgress)
            return renderCardStub(todo, extras)
          },
        })}
      />,
    )
    expect(seen[0]).toEqual({ done: 1, total: 1 })
  })

  it('toggles expand via the caret', async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    renderWithClient(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onToggleExpand })} />)
    await user.click(screen.getByRole('button', { name: 'todos.expand' }))
    expect(onToggleExpand).toHaveBeenCalledWith(1)
  })

  it('shows the caret from child_count for nodes whose children are not loaded', async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    // Lazy tree: server says the node has a child, but the slice isn't fetched.
    renderWithClient(<TodoTree nodes={[node(makeTodo(1, { child_count: 1 }))]} {...handlers({ onToggleExpand })} />)
    await user.click(screen.getByRole('button', { name: 'todos.expand' }))
    expect(onToggleExpand).toHaveBeenCalledWith(1)
  })

  it('renders a loading row while an expanded node\u2019s children are fetching', () => {
    const tree = [{ todo: makeTodo(1), children: [], childrenLoading: true }]
    renderWithClient(<TodoTree nodes={tree} {...handlers({ expanded: new Set([1]) })} />)
    expect(screen.getByText('todos.loadingChildren')).toBeInTheDocument()
  })

  it('offers per-node load-more when the children slice is truncated', async () => {
    const user = userEvent.setup()
    const onLoadChildren = vi.fn()
    const tree = [{ todo: makeTodo(1), children: [node(makeTodo(2))], childrenHasMore: true }]
    renderWithClient(
      <TodoTree
        nodes={tree}
        {...handlers({ expanded: new Set([1]), onLoadChildren })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'todos.loadMoreChildren' }))
    expect(onLoadChildren).toHaveBeenCalledWith(1)
  })

  it('indent nests under the previous sibling', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    // Two roots: todo-2 can indent under its previous sibling todo-1.
    renderWithClient(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers({ onMove })} />)
    const indentBtns = screen.getAllByRole('button', { name: 'todos.indent' })
    await user.click(indentBtns[indentBtns.length - 1]) // todo-2's indent
    expect(onMove).toHaveBeenCalledWith(2, 1, null)
  })

  it('outdent moves under the grandparent, after the former parent', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    // todo-1 > todo-2: outdenting todo-2 makes it a root placed after todo-1.
    renderWithClient(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onMove, expanded: new Set([1]) })} />)
    const outdentBtns = screen.getAllByRole('button', { name: 'todos.outdent' })
    await user.click(outdentBtns[outdentBtns.length - 1]) // todo-2's outdent (todo-1's is disabled)
    expect(onMove).toHaveBeenCalledWith(2, null, 1)
  })

  it('move-up on the 3rd sibling places it after the 1st', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    renderWithClient(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2)), node(makeTodo(3))]} {...handlers({ onMove })} />)
    const upBtns = screen.getAllByRole('button', { name: 'todos.moveUp' })
    await user.click(upBtns[2]) // todo-3 (index 2 → after_id = siblings[0] = 1)
    expect(onMove).toHaveBeenCalledWith(3, null, 1)
  })

  it('move-down places after the next sibling', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    renderWithClient(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers({ onMove })} />)
    const downBtns = screen.getAllByRole('button', { name: 'todos.moveDown' })
    await user.click(downBtns[0]) // todo-1 → after todo-2
    expect(onMove).toHaveBeenCalledWith(1, null, 2)
  })

  it('disables the first row\u2019s up/outdent moves', () => {
    renderWithClient(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers()} />)
    const upBtns = screen.getAllByRole('button', { name: 'todos.moveUp' })
    const outdentBtns = screen.getAllByRole('button', { name: 'todos.outdent' })
    expect(upBtns[0]).toBeDisabled()
    expect(outdentBtns[0]).toBeDisabled()
    expect(upBtns[1]).toBeEnabled()
  })

  it('Tab indents the row under its previous sibling', () => {
    const onMove = vi.fn()
    renderWithClient(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers({ onMove })} />)
    // keydown bubbles from the card body to the row's onKeyDown.
    fireEvent.keyDown(screen.getByText('todo-2'), { key: 'Tab' })
    expect(onMove).toHaveBeenCalledWith(2, 1, null)
  })

  it('Shift+Tab outdents the row to the grandparent', () => {
    const onMove = vi.fn()
    renderWithClient(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onMove, expanded: new Set([1]) })} />)
    fireEvent.keyDown(screen.getByText('todo-2'), { key: 'Tab', shiftKey: true })
    expect(onMove).toHaveBeenCalledWith(2, null, 1)
  })

  it('skips hidden (hideDone) child rows and leaves no empty-expanding caret', () => {
    // One loaded child, done and marked hidden; child_count matches the
    // loaded row → the caret disappears with it instead of expanding to
    // nothing.
    const tree = [node(makeTodo(1, { child_count: 1 }), [
      { todo: makeTodo(2, { status: 'done' }), children: [], hidden: true },
    ])]
    renderWithClient(<TodoTree nodes={tree} {...handlers({ expanded: new Set([1]) })} />)
    expect(screen.getByText('todo-1')).toBeInTheDocument()
    expect(screen.queryByText('todo-2')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'todos.collapse' })).not.toBeInTheDocument()
  })

  it('keeps the caret when hidden children are matched by unfetched ones', () => {
    // child_count 2 with one loaded+hidden done row: the unfetched child may
    // be pending, so the caret must stay.
    const tree = [node(makeTodo(1, { child_count: 2 }), [
      { todo: makeTodo(2, { status: 'done' }), children: [], hidden: true },
    ])]
    renderWithClient(<TodoTree nodes={tree} {...handlers({ expanded: new Set([1]) })} />)
    expect(screen.queryByText('todo-2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'todos.collapse' })).toBeInTheDocument()
  })
})
