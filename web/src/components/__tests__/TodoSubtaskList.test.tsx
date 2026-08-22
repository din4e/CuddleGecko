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
        onToggle={vi.fn()} onEdit={vi.fn()} onAddChild={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders children and nested grandchildren (arbitrary depth)', () => {
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} onAddChild={vi.fn()} />,
    )
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(screen.getByText('Grandchild')).toBeInTheDocument()
  })

  it('toggles a subtask and opens edit via the title', () => {
    const onToggle = vi.fn()
    const onEdit = vi.fn()
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={onToggle} onEdit={onEdit} onAddChild={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Child'))
    expect(onEdit).toHaveBeenCalledWith(child)
    fireEvent.click(screen.getAllByLabelText('todos.markDone')[0])
    expect(onToggle).toHaveBeenCalledWith(child)
  })
})
