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
    collapsed: new Set<number>(),
    onToggleCollapse: vi.fn(),
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
    render(<TodoTree nodes={tree} {...handlers()} />)
    expect(screen.getByText('todo-1')).toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
  })

  it('collapses children via the caret', async () => {
    const user = userEvent.setup()
    const onToggleCollapse = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onToggleCollapse })} />)
    await user.click(screen.getByRole('button', { name: 'todos.collapse' }))
    expect(onToggleCollapse).toHaveBeenCalledWith(1)
  })

  it('toggles done via the circle button', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1))]} {...handlers({ onToggle })} />)
    await user.click(screen.getByRole('button', { name: 'todos.toggleDone' }))
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
    render(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onMove })} />)
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

  it('add-child hands the row todo to the create flow', async () => {
    const user = userEvent.setup()
    const onAddChild = vi.fn()
    render(<TodoTree nodes={[node(makeTodo(1))]} {...handlers({ onAddChild })} />)
    await user.click(screen.getByRole('button', { name: 'todos.addChild' }))
    expect(onAddChild).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
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
    render(<TodoTree nodes={[node(makeTodo(1), [node(makeTodo(2))])]} {...handlers({ onMove })} />)
    fireEvent.keyDown(screen.getByText('todo-2'), { key: 'Tab', shiftKey: true })
    expect(onMove).toHaveBeenCalledWith(2, null, 1)
  })
})
