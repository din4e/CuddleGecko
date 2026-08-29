import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoTree from '../TodoTreeRow'
import type { TodoTreeHandlers } from '../TodoTreeRow'
import type { Todo } from '../../types'
import type { TodoNode } from '../../lib/buildTodoTree'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

vi.mock('../TodoChecklist', () => ({
  TodoChecklist: ({ todoId }: { todoId: number }) => (
    <div data-testid={`checklist-${todoId}`}>checklist</div>
  ),
}))

function makeTodo(id: number, overrides: Partial<Todo> = {}): Todo {
  return {
    id, user_id: 1, workspace_id: 1, title: `todo-${id}`, description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...overrides,
  }
}

const node = (todo: Todo, children: TodoNode[] = []): TodoNode => ({ todo, children })

function handlers(overrides: Partial<TodoTreeHandlers> = {}): TodoTreeHandlers {
  return {
    expanded: new Set<number>(),
    onToggleExpand: vi.fn(),
    onToggle: vi.fn(),
    onRename: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onAddChild: vi.fn(),
    formatDate: () => '',
    ...overrides,
  }
}

describe('TodoTree', () => {
  it('renders roots and nested children', () => {
    const tree = [node(makeTodo(1), [node(makeTodo(2))])]
    render(<TodoTree nodes={tree} {...handlers({ expanded: new Set([1]) })} />)
    expect(screen.getByText('todo-1')).toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
  })

  it('toggles expand via the caret', async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onToggleExpand })} />)
    await user.click(screen.getByRole('button', { name: 'todos.expand' }))
    expect(onToggleExpand).toHaveBeenCalledWith(1)
  })

  it('shows the caret from child_count for nodes whose children are not loaded', async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    // Lazy tree: server says the node has a child, but the slice isn't fetched.
    render(<TodoTree nodes={[node(makeTodo(1, { child_count: 1 }))]} {...handlers({ onToggleExpand })} />)
    await user.click(screen.getByRole('button', { name: 'todos.expand' }))
    expect(onToggleExpand).toHaveBeenCalledWith(1)
  })

  it('renders a loading row while an expanded node\u2019s children are fetching', () => {
    const tree = [{ todo: makeTodo(1), children: [], childrenLoading: true }]
    render(<TodoTree nodes={tree} {...handlers({ expanded: new Set([1]) })} />)
    expect(screen.getByText('todos.loadingChildren')).toBeInTheDocument()
  })

  it('offers per-node load-more when the children slice is truncated', async () => {
    const user = userEvent.setup()
    const onLoadChildren = vi.fn()
    const tree = [{ todo: makeTodo(1), children: [node(makeTodo(2))], childrenHasMore: true }]
    render(
      <TodoTree
        nodes={tree}
        {...handlers({ expanded: new Set([1]), onLoadChildren })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'todos.loadMoreChildren' }))
    expect(onLoadChildren).toHaveBeenCalledWith(1)
  })

  it('toggles done via the circle button', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1))]} {...handlers({ onToggle })} />)
    await user.click(screen.getByRole('button', { name: 'todos.markDone' }))
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('indent nests under the previous sibling', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    // Two roots: todo-2 can indent under its previous sibling todo-1.
    render(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers({ onMove })} />)
    const indentBtns = screen.getAllByRole('button', { name: 'todos.indent' })
    await user.click(indentBtns[indentBtns.length - 1]) // todo-2's indent
    expect(onMove).toHaveBeenCalledWith(2, 1, null)
  })

  it('outdent moves under the grandparent, after the former parent', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    // todo-1 > todo-2: outdenting todo-2 makes it a root placed after todo-1.
    render(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onMove, expanded: new Set([1]) })} />)
    const outdentBtns = screen.getAllByRole('button', { name: 'todos.outdent' })
    await user.click(outdentBtns[outdentBtns.length - 1]) // todo-2's outdent (todo-1's is disabled)
    expect(onMove).toHaveBeenCalledWith(2, null, 1)
  })

  it('move-up on the 3rd sibling places it after the 1st', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2)), node(makeTodo(3))]} {...handlers({ onMove })} />)
    const upBtns = screen.getAllByRole('button', { name: 'todos.moveUp' })
    await user.click(upBtns[2]) // todo-3 (index 2 → after_id = siblings[0] = 1)
    expect(onMove).toHaveBeenCalledWith(3, null, 1)
  })

  it('move-down places after the next sibling', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers({ onMove })} />)
    const downBtns = screen.getAllByRole('button', { name: 'todos.moveDown' })
    await user.click(downBtns[0]) // todo-1 → after todo-2
    expect(onMove).toHaveBeenCalledWith(1, null, 2)
  })

  it('add-child hands the row todo to the create flow when no inline handler is given', async () => {
    const user = userEvent.setup()
    const onAddChild = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1))]} {...handlers({ onAddChild })} />)
    await user.click(screen.getByRole('button', { name: 'todos.addChild' }))
    expect(onAddChild).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('add-child becomes an inline input that creates children on Enter', async () => {
    const user = userEvent.setup()
    const onCreateChild = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1))]} {...handlers({ onCreateChild })} />)
    await user.click(screen.getByRole('button', { name: 'todos.addChild' }))
    const input = screen.getByPlaceholderText('todos.addSubtaskPlaceholder')
    await user.type(input, '快速子任务{Enter}')
    expect(onCreateChild).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), '快速子任务')
    // Input stays open with a cleared draft for rapid entry.
    expect(screen.getByPlaceholderText('todos.addSubtaskPlaceholder')).toHaveValue('')
  })

  it('toggles the inline subtask checklist', async () => {
    const user = userEvent.setup()
    render(<TodoTree nodes={[node(makeTodo(1))]} {...handlers()} />)
    expect(screen.queryByTestId('checklist-1')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'todos.subtasks' }))
    expect(screen.getByTestId('checklist-1')).toBeInTheDocument()
  })

  it('renders a selection checkbox in bulk mode', async () => {
    const user = userEvent.setup()
    const onSelectToggle = vi.fn()
    render(
      <TodoTree
        nodes={[node(makeTodo(1))]}
        {...handlers({ onSelectToggle })}
        selectable
        selectedIds={new Set()}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'todos.select' }))
    expect(onSelectToggle).toHaveBeenCalledWith(1)
  })

  it('Tab indents the row under its previous sibling', () => {
    const onMove = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1)), node(makeTodo(2))]} {...handlers({ onMove })} />)
    // keydown bubbles from the title span to the row's onKeyDown.
    fireEvent.keyDown(screen.getByText('todo-2'), { key: 'Tab' })
    expect(onMove).toHaveBeenCalledWith(2, 1, null)
  })

  it('Shift+Tab outdents the row to the grandparent', () => {
    const onMove = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onMove, expanded: new Set([1]) })} />)
    fireEvent.keyDown(screen.getByText('todo-2'), { key: 'Tab', shiftKey: true })
    expect(onMove).toHaveBeenCalledWith(2, null, 1)
  })
})
