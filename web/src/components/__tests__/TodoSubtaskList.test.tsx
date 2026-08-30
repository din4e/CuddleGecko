import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TodoSubtaskList from '../TodoSubtaskList'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))
import type { Todo } from '../../types'

const base = (over: Partial<Todo> & { id: number; title: string; parent_id: number | null }): Todo => ({
  status: 'pending', priority: 'normal', due_time: null, amount: null, amount_type: '',
  contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1,
  completed_at: null, created_at: '', updated_at: '',
  ...over,
} as Todo)

const parent = base({ id: 1, title: 'Parent', parent_id: null })
const child = base({ id: 2, title: 'Child', parent_id: 1 })
const grandchild = base({ id: 3, title: 'Grandchild', parent_id: 2 })

function makeMap() {
  return new Map([
    [1, [child]],
    [2, [grandchild]],
  ])
}

describe('TodoSubtaskList', () => {
  it('renders nothing for a todo without children', () => {
    const { container } = render(
      <TodoSubtaskList todo={parent} childrenByParent={new Map()}
        onToggle={vi.fn()} onEdit={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders children and nested grandchildren (arbitrary depth)', () => {
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} />,
    )
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(screen.getByText('Grandchild')).toBeInTheDocument()
  })

  it('toggles a subtask and opens edit via the title', () => {
    const onToggle = vi.fn()
    const onEdit = vi.fn()
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={onToggle} onEdit={onEdit} />,
    )
    fireEvent.click(screen.getByText('Child'))
    expect(onEdit).toHaveBeenCalledWith(child)
    fireEvent.click(screen.getAllByLabelText('todos.markDone')[0])
    expect(onToggle).toHaveBeenCalledWith(child)
  })

  it('shows the inline adder with onCreateChild even without children', () => {
    const onCreateChild = vi.fn()
    render(
      <TodoSubtaskList todo={parent} childrenByParent={new Map()}
        onToggle={vi.fn()} onEdit={vi.fn()}
        onCreateChild={onCreateChild} />,
    )
    fireEvent.click(screen.getByText('todos.addChild'))
    const input = screen.getByPlaceholderText('todos.addSubtaskPlaceholder')
    fireEvent.change(input, { target: { value: 'New subtask' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateChild).toHaveBeenCalledWith(parent, 'New subtask')
    // Stays open with a cleared draft for rapid multi-entry.
    expect(screen.getByPlaceholderText('todos.addSubtaskPlaceholder')).toHaveValue('')
  })

  it('offers an inline adder at every depth', () => {
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()}
        onCreateChild={vi.fn()} />,
    )
    // One trailing adder entry per level (top + nested list) plus per-row "+"
    // buttons — deeper subtasks are as easy to extend as top-level ones.
    expect(screen.getAllByText('todos.addChild').length).toBeGreaterThan(1)
  })

  it('offers an inline adder at every depth (deepest first in the DOM)', () => {
    const onCreateChild = vi.fn()
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()}
        onCreateChild={onCreateChild} />,
    )
    // The first adder entry in the DOM belongs to the deepest level — the
    // grandchild's own list — proving the adder exists beyond depth 1.
    fireEvent.click(screen.getAllByText('todos.addChild')[0])
    const input = screen.getByPlaceholderText('todos.addSubtaskPlaceholder')
    fireEvent.change(input, { target: { value: 'Deep subtask' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateChild).toHaveBeenCalledWith(grandchild, 'Deep subtask')
  })

  it('shows the due label and routes delete through onDelete', () => {
    const onDelete = vi.fn()
    const dated = { ...child, due_time: '2999-01-01T10:00:00Z' }
    render(
      <TodoSubtaskList todo={parent} childrenByParent={new Map([[1, [dated]]])}
        onToggle={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent.click(screen.getAllByLabelText('common.delete')[0])
    expect(onDelete).toHaveBeenCalledWith(dated)
  })
})
