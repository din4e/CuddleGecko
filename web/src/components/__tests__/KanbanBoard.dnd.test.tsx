import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../types'

const dnd = vi.hoisted(() => ({ sortableIds: [] as string[] }))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  DragOverlay: ({ children }: { children: React.ReactNode }) => children,
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  closestCorners: () => [],
  rectIntersection: () => [],
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children, id }: { children: React.ReactNode; id?: string }) => {
    if (id) dnd.sortableIds.push(id)
    return children
  },
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: '', isDragging: false }),
  verticalListSortingStrategy: {},
  horizontalListSortingStrategy: {},
  arrayMove: <T,>(items: T[]) => items,
}))

import KanbanBoard from '../KanbanBoard'

const todo: Todo = {
  id: 1,
  title: 'Task',
  description: '',
  status: 'pending',
  priority: 'normal',
  contact_ids: [],
  due_time: null,
  amount: null,
  amount_type: '',
  color: '',
  user_id: 1,
  workspace_id: 1,
  completed_at: null,
  created_at: '',
  updated_at: '',
} as Todo

beforeEach(() => {
  dnd.sortableIds.length = 0
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
})

describe('KanbanBoard cell dragging', () => {
  it('assigns each card sortable context the matching droppable cell id', () => {
    render(
      <KanbanBoard
        todos={[todo]}
        columns={[{ id: 'status-pending', label: 'Pending', kind: 'status', value: 'pending' }]}
        tags={[]}
        addColumn={vi.fn()}
        removeColumn={vi.fn()}
        onColumnsReorder={vi.fn()}
        renderCard={(item) => <span>{item.title}</span>}
        onCardDropColumn={vi.fn()}
        onReorder={vi.fn()}
        onCreateInColumn={vi.fn()}
      />,
    )

    expect(dnd.sortableIds).toContain('cell:all|status-pending')
  })
})
