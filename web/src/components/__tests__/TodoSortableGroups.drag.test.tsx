import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../types'

const dnd = vi.hoisted(() => ({
  props: null as Record<string, (event: never) => void> | null,
  sortableIds: [] as string[],
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, ...props }: { children: React.ReactNode }) => {
    dnd.props = props as never
    return children
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => children,
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  closestCorners: () => [],
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children, id }: { children: React.ReactNode; id?: string }) => {
    if (id) dnd.sortableIds.push(id)
    return children
  },
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: '', isDragging: false }),
  rectSortingStrategy: {},
}))

import TodoSortableGroups from '../TodoSortableGroups'

const todo = (id: number, title: string): Todo => ({
  id,
  title,
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
} as Todo)

describe('TodoSortableGroups cross-group dragging', () => {
  it('keeps the original group after the live preview and commits the group drop', async () => {
    dnd.sortableIds.length = 0
    const onGroupDrop = vi.fn()
    render(
      <TodoSortableGroups
        groups={[
          { key: 'today', items: [todo(1, 'Today task')] },
          { key: 'later', items: [todo(2, 'Later task')] },
        ]}
        renderCard={(item) => <span>{item.title}</span>}
        onGroupDrop={onGroupDrop}
      />,
    )

    // A sortable card reports its container id. The id must match the drop
    // body's id, otherwise the target group cannot be resolved on card drops.
    expect(dnd.sortableIds).toEqual(expect.arrayContaining(['group:today', 'group:later']))

    const active = { id: 't1', rect: { current: { translated: null } } }
    const over = {
      id: 't2',
      data: { current: { sortable: { containerId: 'group:later' } } },
      rect: { top: 0, height: 20 },
    }
    await act(async () => { dnd.props?.onDragStart({ active } as never) })
    await act(async () => { dnd.props?.onDragOver({ active, over } as never) })
    await act(async () => { dnd.props?.onDragEnd({ active, over } as never) })

    expect(onGroupDrop).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'later')
  })
})
