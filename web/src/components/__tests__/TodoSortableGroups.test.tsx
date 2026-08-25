import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodoSortableGroups from '../TodoSortableGroups'
import { cardDropZone } from '../../lib/dnd'
import type { Todo } from '../../types'

function makeTodo(partial: Partial<Todo>): Todo {
  return {
    id: 1,
    title: 'task',
    description: '',
    status: 'pending',
    priority: 'normal',
    contact_ids: [],
    ...partial,
  } as Todo
}

const groups = [
  { key: 'today', label: <h3>Today</h3>, items: [makeTodo({ id: 1, title: 'Buy milk' })] },
  { key: 'later', label: <h3>Later</h3>, items: [makeTodo({ id: 2, title: 'Ship release' })] },
]

function renderGroups(props = {}) {
  return render(
    <TodoSortableGroups
      groups={groups}
      renderCard={(todo) => <div>{todo.title}</div>}
      onGroupDrop={vi.fn()}
      onReorder={vi.fn()}
      {...props}
    />,
  )
}

describe('TodoSortableGroups', () => {
  it('renders the group labels and their cards', () => {
    renderGroups()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Later')).toBeInTheDocument()
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    expect(screen.getByText('Ship release')).toBeInTheDocument()
  })

  it('renders without a header when the group has no label (flat lists)', () => {
    render(
      <TodoSortableGroups
        groups={[{ key: 'manual', items: [makeTodo({ id: 1, title: 'Solo' })] }]}
        renderCard={(todo) => <div>{todo.title}</div>}
      />,
    )
    expect(screen.getByText('Solo')).toBeInTheDocument()
  })
})

describe('cardDropZone (tri-zone drop semantics)', () => {
  // Hovered card spans y=100..180 (height 80).
  const over = { top: 100, height: 80 }

  it('top quarter → top (insert before), bottom quarter → bottom (insert after)', () => {
    expect(cardDropZone({ top: 100, height: 20 }, over)).toBe('top') // center 110, rel .125
    expect(cardDropZone({ top: 158, height: 20 }, over)).toBe('bottom') // center 168, rel .85
  })

  it('middle half → middle (nest as child)', () => {
    expect(cardDropZone({ top: 125, height: 30 }, over)).toBe('middle') // center 140, rel .5
    expect(cardDropZone({ top: 114, height: 30 }, over)).toBe('middle') // center 129, rel .36
  })

  it('falls back to middle when rects are unavailable (jsdom / keyboard drags)', () => {
    expect(cardDropZone(null, over)).toBe('middle')
    expect(cardDropZone({ top: 0, height: 10 }, null)).toBe('middle')
    expect(cardDropZone({ top: 0, height: 10 }, { top: 0, height: 0 })).toBe('middle')
  })
})
