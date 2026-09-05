import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, createEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoSubtaskList from '../TodoSubtaskList'
import type { TodoSubtaskListProps } from '../TodoSubtaskList'
import { useTodoCollapseStore } from '../../stores/todoCollapse'

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

// --- drag & drop fixtures -------------------------------------------------
// jsdom has no DataTransfer; handlers only touch these three members.
const dt = () => ({ effectAllowed: '', dropEffect: '', setData: vi.fn() })
const rowOf = (title: string) => screen.getByTitle(title).parentElement!
const mockRect = (el: Element, height = 40) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0, bottom: height, height, left: 0, right: 100, width: 100, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
// jsdom's drag events don't carry pointer coordinates (fireEvent builds a
// plain Event), so the tri-zone splitter would see NaN and always pick the
// middle band. Inject clientY explicitly on the created event.
const dragWithY = (type: 'dragOver' | 'drop', el: Element, y: number) => {
  const ev = createEvent[type](el, { dataTransfer: dt() })
  Object.defineProperty(ev, 'clientY', { value: y })
  fireEvent(el, ev)
}

/** Holds dragId in state like the page does, so dragStart → re-render → the
 *  rows see the new drag id and act as drop targets. */
function DndHarness(props: Omit<TodoSubtaskListProps, 'dragId' | 'onDragIdChange'>) {
  const [dragId, setDragId] = useState<number | null>(null)
  return <TodoSubtaskList {...props} dragId={dragId} onDragIdChange={setDragId} />
}

const childB = base({ id: 4, title: 'Child B', parent_id: 1 })
const childBKid = base({ id: 5, title: 'Child B kid', parent_id: 4 })
function makeDndMap() {
  return new Map<number, Todo[]>([
    [1, [child, childB]],
    [2, [grandchild]],
    [4, [childBKid]],
  ])
}

describe('TodoSubtaskList', () => {
  beforeEach(() => {
    // Fold state lives in a persisted shared store — reset so cases stay
    // independent (and leftover folds from other test files don't leak in).
    useTodoCollapseStore.setState({ collapsed: new Set() })
  })

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

  it('offers a trailing adder on every row at any depth (one per row, no text entries)', () => {
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()}
        onCreateChild={vi.fn()} />,
    )
    // One trailing "+" per row (Child + Grandchild) — any task can gain a
    // subtask directly, with no second text-style entry anywhere.
    expect(screen.getAllByRole('button', { name: 'todos.addChild' }).length).toBe(2)
    // No adder input until a row's "+" is clicked.
    expect(screen.queryByPlaceholderText('todos.addSubtaskPlaceholder')).not.toBeInTheDocument()
  })

  it('opens the deepest row-level adder and commits to that row', async () => {
    const onCreateChild = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()}
        onCreateChild={onCreateChild} />,
    )
    // The "+" INSIDE the Grandchild row adds to the grandchild, proving the
    // adder works beyond depth 1.
    const grandRow = rowOf('Grandchild')
    await user.click(within(grandRow).getByRole('button', { name: 'todos.addChild' }))
    const input = screen.getByPlaceholderText('todos.addSubtaskPlaceholder')
    await user.type(input, 'Deep subtask{Enter}')
    expect(onCreateChild).toHaveBeenCalledWith(grandchild, 'Deep subtask')
    // Stays open with a cleared draft for rapid multi-entry.
    expect(screen.getByPlaceholderText('todos.addSubtaskPlaceholder')).toHaveValue('')
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

  it('folds and unfolds a nested branch via the row caret', () => {
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} />,
    )
    expect(screen.getByText('Grandchild')).toBeInTheDocument()
    // The Child row carries the only caret (it has children; Grandchild doesn't).
    fireEvent.click(screen.getByRole('button', { name: 'todos.collapse' }))
    expect(screen.queryByText('Grandchild')).not.toBeInTheDocument()
    expect(screen.getByText('Child')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'todos.expand' }))
    expect(screen.getByText('Grandchild')).toBeInTheDocument()
  })

  it('folds persist per scope — the same page shares, other surfaces stay open', () => {
    // Fold a branch on the default (page) scope.
    const { unmount } = render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'todos.collapse' }))
    unmount()
    // A fresh instance of the SAME scope (same view re-rendered) inherits
    // the fold instead of popping the branch back open.
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} />,
    )
    expect(screen.queryByText('Grandchild')).not.toBeInTheDocument()
    unmount()
    // A DIFFERENT scope (the drawer) has its own folds — still expanded.
    render(
      <TodoSubtaskList todo={parent} childrenByParent={makeMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} collapseScope="drawer" />,
    )
    expect(screen.getByText('Grandchild')).toBeInTheDocument()
  })

  it('hideDone drops settled done rows but keeps done rows with open descendants', () => {
    const doneChild = base({ id: 4, title: 'Done child', parent_id: 1, status: 'done', completed_at: '2026-05-01' })
    const openChild = base({ id: 5, title: 'Open child', parent_id: 1 })
    const doneParentOfOpen = base({ id: 6, title: 'Done parent of open', parent_id: 1, status: 'done', completed_at: '2026-05-01', child_count: 1 })
    const openGrandchild = base({ id: 7, title: 'Open grandchild', parent_id: 6 })
    render(
      <TodoSubtaskList todo={parent}
        childrenByParent={new Map<number, Todo[]>([
          [1, [doneChild, openChild, doneParentOfOpen]],
          [6, [openGrandchild]],
        ])}
        onToggle={vi.fn()} onEdit={vi.fn()} hideDone />,
    )
    expect(screen.queryByText('Done child')).not.toBeInTheDocument()
    expect(screen.getByText('Open child')).toBeInTheDocument()
    // The done row stays BECAUSE it still has an open descendant — hiding it
    // would swallow the pending grandchild nested beneath it.
    expect(screen.getByText('Done parent of open')).toBeInTheDocument()
    expect(screen.getByText('Open grandchild')).toBeInTheDocument()
  })

  it('hideDone drops abandoned rows too, unless they hide open descendants', () => {
    const abandonedChild = base({ id: 12, title: 'Abandoned child', parent_id: 1, status: 'abandoned' })
    const abandonedParentOfOpen = base({ id: 13, title: 'Abandoned parent of open', parent_id: 1, status: 'abandoned', child_count: 1 })
    const openGrandchild = base({ id: 14, title: 'Open under abandoned', parent_id: 13 })
    render(
      <TodoSubtaskList todo={parent}
        childrenByParent={new Map<number, Todo[]>([
          [1, [abandonedChild, abandonedParentOfOpen]],
          [13, [openGrandchild]],
        ])}
        onToggle={vi.fn()} onEdit={vi.fn()} hideDone />,
    )
    expect(screen.queryByText('Abandoned child')).not.toBeInTheDocument()
    // An abandoned row with a pending descendant stays — same orphan-safety
    // rule as done rows.
    expect(screen.getByText('Abandoned parent of open')).toBeInTheDocument()
    expect(screen.getByText('Open under abandoned')).toBeInTheDocument()
  })

  it('hideDone keeps a done row whose children are not loaded yet', () => {
    // child_count > 0 with no slice in the map: the descendants are unknown,
    // so the row stays until they load (pending work never disappears).
    const unloaded = base({ id: 8, title: 'Unloaded done', parent_id: 1, status: 'done', completed_at: '2026-05-01', child_count: 2 })
    render(
      <TodoSubtaskList todo={parent} childrenByParent={new Map([[1, [unloaded]]])}
        onToggle={vi.fn()} onEdit={vi.fn()} hideDone />,
    )
    expect(screen.getByText('Unloaded done')).toBeInTheDocument()
  })

  it('hideDone renders nothing when every row is settled-done and no adder is wired', () => {
    const onlyDone = base({ id: 9, title: 'Only done', parent_id: 1, status: 'done', completed_at: '2026-05-01' })
    const { container } = render(
      <TodoSubtaskList todo={parent} childrenByParent={new Map([[1, [onlyDone]]])}
        onToggle={vi.fn()} onEdit={vi.fn()} hideDone />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('hideDone keeps the progress chip truthful while hiding the done rows themselves', () => {
    const pendingParent = base({ id: 10, title: 'Pending row', parent_id: 1 })
    const doneGrand = base({ id: 11, title: 'Done grand', parent_id: 10, status: 'done', completed_at: '2026-05-01' })
    render(
      <TodoSubtaskList todo={parent}
        childrenByParent={new Map<number, Todo[]>([
          [1, [pendingParent]],
          [10, [doneGrand]],
        ])}
        onToggle={vi.fn()} onEdit={vi.fn()} hideDone />,
    )
    // The done grandchild row is hidden, but the chip on Pending row still
    // reports the real 1/1 — that's why nothing seems missing.
    expect(screen.queryByText('Done grand')).not.toBeInTheDocument()
    expect(screen.getByText('1/1')).toBeInTheDocument()
    // All visible children hidden → no caret that would expand to nothing.
    expect(screen.queryByRole('button', { name: 'todos.collapse' })).not.toBeInTheDocument()
  })

  it('nests a dragged subtask under another row and unfolds the target', () => {
    const onMove = vi.fn()
    // Child B starts folded — the drop must reveal it for the result to show.
    useTodoCollapseStore.setState({ collapsed: new Set(['page:4']) })
    render(
      <DndHarness todo={parent} childrenByParent={makeDndMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} onMove={onMove} />,
    )
    expect(screen.queryByText('Child B kid')).not.toBeInTheDocument()
    const rowB = rowOf('Child B')
    mockRect(rowB)
    fireEvent.dragStart(rowOf('Grandchild'), { dataTransfer: dt() })
    // Middle band (20/40) → nest under Child B as its last child.
    dragWithY('dragOver', rowB, 20)
    dragWithY('drop', rowB, 20)
    expect(onMove).toHaveBeenCalledWith(3, 4, 'last')
    expect(screen.getByText('Child B kid')).toBeInTheDocument()
  })

  it('upper/lower row bands drop the drag as a sibling of the row', () => {
    const onMove = vi.fn()
    render(
      <DndHarness todo={parent} childrenByParent={makeDndMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} onMove={onMove} />,
    )
    const rowChild = rowOf('Child')
    mockRect(rowChild)
    fireEvent.dragStart(rowOf('Child B'), { dataTransfer: dt() })
    // Top band → before Child, which is first → afterId null (top of group).
    dragWithY('dragOver', rowChild, 4)
    dragWithY('drop', rowChild, 4)
    expect(onMove).toHaveBeenCalledWith(4, 1, null)
    // Bottom band → after Child.
    fireEvent.dragStart(rowOf('Child B'), { dataTransfer: dt() })
    dragWithY('dragOver', rowChild, 36)
    dragWithY('drop', rowChild, 36)
    expect(onMove).toHaveBeenCalledWith(4, 1, 2)
  })

  it('refuses a drop onto the drag\'s own descendant (cycle)', () => {
    const onMove = vi.fn()
    render(
      <DndHarness todo={parent} childrenByParent={makeDndMap()}
        onToggle={vi.fn()} onEdit={vi.fn()} onMove={onMove} />,
    )
    const rowGrand = rowOf('Grandchild')
    mockRect(rowGrand)
    // Child is Grandchild's ancestor — neither zone may accept it.
    fireEvent.dragStart(rowOf('Child'), { dataTransfer: dt() })
    dragWithY('dragOver', rowGrand, 20)
    dragWithY('drop', rowGrand, 20)
    expect(onMove).not.toHaveBeenCalled()
  })
})
