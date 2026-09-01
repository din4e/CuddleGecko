import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import TodoTree from '../TodoTreeRow'
import { buildTodoTree, type TodoNode } from '../../lib/buildTodoTree'
import type { Todo } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

const base = (id: number, title: string, parent_id: number | null = null): Todo => ({
  id, title, parent_id, status: 'pending', priority: 'normal', due_time: null, amount: null,
  amount_type: '', contact_ids: [], color: '', description: '', user_id: 1, workspace_id: 1,
  completed_at: null, created_at: '', updated_at: '',
} as Todo)

// tree: 1 (root) ─ 2 (child) ─ 3 (grandchild);  4 (root)
const todos = [base(1, 'Root A'), base(2, 'Child A1', 1), base(3, 'Grandchild', 2), base(4, 'Root B')]
const nodes: TodoNode[] = buildTodoTree(todos)

const handlers = {
  // All nodes expanded so the nested rows are visible for drop targeting.
  expanded: new Set<number>(todos.map((t) => t.id)),
  onToggleExpand: vi.fn(),
  onToggle: vi.fn(),
  onRename: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  formatDate: () => '',
}

function renderTree(expanded?: Set<number>) {
  const onDragIdChange = vi.fn()
  function Harness() {
    const [dragId, setDragId] = useState<number | null>(null)
    onDragIdChange.mockImplementation((id: number | null) => setDragId(id))
    return (
      <TodoTree
        nodes={nodes}
        {...handlers}
        expanded={expanded ?? handlers.expanded}
        dragId={dragId}
        onDragIdChange={onDragIdChange}
      />
    )
  }
  const utils = render(<Harness />)
  return { onDragIdChange, ...utils }
}

function zoneOf(el: HTMLElement, fraction: number) {
  // resolveDropZone reads clientY vs the row rect; fake a tall row so the
  // fraction maps predictably.
  el.getBoundingClientRect = () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 0, width: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return 100 * fraction
}

// jsdom has no DragEvent, and fireEvent drops UIEvent-only props like
// clientY — dispatch manually with the props assigned after construction.
function fireDrag(el: HTMLElement, type: 'dragover' | 'drop', clientY: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientY, dataTransfer: { dropEffect: 'move' } })
  fireEvent(el, ev)
}

beforeEach(() => vi.clearAllMocks())

describe('TodoTree drag & drop reparenting', () => {
  it('drop on the middle of a row makes the dragged task its last child', () => {
    const { onDragIdChange } = renderTree()
    const rootB = screen.getByText('Root B').closest('div[tabindex="0"]') as HTMLElement
    const rootA = screen.getByText('Root A').closest('div[tabindex="0"]') as HTMLElement

    // The row delegates "last child" to the server (afterId='last'), so the
    // position holds even for collapsed/partially loaded parents.
    fireEvent.dragStart(rootB, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    expect(onDragIdChange).toHaveBeenCalledWith(4)
    fireDrag(rootA, 'dragover', zoneOf(rootA, 0.5))
    fireDrag(rootA, 'drop', zoneOf(rootA, 0.5))

    expect(handlers.onMove).toHaveBeenCalledWith(4, 1, 'last')
  })

  it('middle drop on a collapsed row appends last and expands it so the drop is visible', () => {
    // Only Root A expanded: Child A1 is visible but its own child is not.
    renderTree(new Set([1]))
    const rootB = screen.getByText('Root B').closest('div[tabindex="0"]') as HTMLElement
    const childA1 = screen.getByText('Child A1').closest('div[tabindex="0"]') as HTMLElement

    fireEvent.dragStart(rootB, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    fireDrag(childA1, 'dragover', zoneOf(childA1, 0.5))
    fireDrag(childA1, 'drop', zoneOf(childA1, 0.5))

    expect(handlers.onMove).toHaveBeenCalledWith(4, 2, 'last')
    expect(handlers.onToggleExpand).toHaveBeenCalledWith(2)
  })

  it('drop near the top edge inserts as previous sibling', () => {
    renderTree()
    const rootB = screen.getByText('Root B').closest('div[tabindex="0"]') as HTMLElement
    const childA1 = screen.getByText('Child A1').closest('div[tabindex="0"]') as HTMLElement

    fireEvent.dragStart(rootB, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    // Child A1 is index 0 under parent 1 → before-insert has no prev sibling.
    fireDrag(childA1, 'dragover', zoneOf(childA1, 0.1))
    fireDrag(childA1, 'drop', zoneOf(childA1, 0.1))

    expect(handlers.onMove).toHaveBeenCalledWith(4, 1, null)
  })

  it('refuses drops onto the dragged node itself', () => {
    renderTree()
    const rootA = screen.getByText('Root A').closest('div[tabindex="0"]') as HTMLElement
    fireEvent.dragStart(rootA, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    fireDrag(rootA, 'dragover', 50)
    fireDrag(rootA, 'drop', 50)
    expect(handlers.onMove).not.toHaveBeenCalled()
  })

  it('refuses drops into the dragged node\'s own descendants (cycle)', () => {
    renderTree()
    const rootA = screen.getByText('Root A').closest('div[tabindex="0"]') as HTMLElement
    const grand = screen.getByText('Grandchild').closest('div[tabindex="0"]') as HTMLElement
    fireEvent.dragStart(rootA, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    fireDrag(grand, 'dragover', zoneOf(grand, 0.5))
    fireDrag(grand, 'drop', zoneOf(grand, 0.5))
    expect(handlers.onMove).not.toHaveBeenCalled()
  })
})
