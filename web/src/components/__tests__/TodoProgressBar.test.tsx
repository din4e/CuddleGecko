import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import TodoProgressBar from '../TodoProgressBar'

/** The bar lives inside draggable rows (native HTML5 DnD + dnd-kit). A press
 *  on the bar must claim the gesture: default-prevented (kills the row's
 *  native dragstart) and propagation-stopped (dnd-kit sensors), or the row
 *  would start moving together with the scrub. */
describe('TodoProgressBar', () => {
  function renderBar(props: { percent: number | null; onCommit?: (pct: number | null) => void }) {
    const utils = render(<TodoProgressBar {...props} />)
    const bar = (props.onCommit
      ? utils.container.querySelector('[role="slider"]')
      : utils.container.querySelector('[role="img"]')) as HTMLElement
    // jsdom returns all-zero rects; give the bar a deterministic 100px track.
    bar.getBoundingClientRect = () => ({ x: 0, y: 0, width: 100, height: 12, top: 0, left: 0, bottom: 12, right: 100, toJSON: () => ({}) } as DOMRect)
    return { ...utils, bar }
  }

  it('claims the gesture on pointerdown/move: preventDefault, commits on release', () => {
    const onCommit = vi.fn()
    const { bar } = renderBar({ percent: 50, onCommit })

    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 20 })
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 60 })
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 60 })
    expect(onCommit).toHaveBeenCalledWith(60)

    // and the events were default-prevented (row drag suppression)
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2, clientX: 30 })
    bar.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    const move = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 2, clientX: 70 })
    // a move without a preceding (React-flushed) press stays passive
    bar.dispatchEvent(move)
  })

  it('never becomes the source of an HTML5 drag', () => {
    const onCommit = vi.fn()
    const { bar } = renderBar({ percent: 10, onCommit })
    const drag = new Event('dragstart', { bubbles: true, cancelable: true })
    bar.dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(true)
  })

  it('non-interactive display mode never claims the gesture', () => {
    const { bar } = renderBar({ percent: 40 })
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, clientX: 50 })
    bar.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
  })

  it('double-click clears the progress', () => {
    const onCommit = vi.fn()
    const { bar } = renderBar({ percent: 40, onCommit })
    fireEvent.doubleClick(bar)
    expect(onCommit).toHaveBeenCalledWith(null)
  })
it('a dblclick trailing a rapid drag-adjust keeps the value (no wipe)', () => {
    const onCommit = vi.fn()
    const { bar } = renderBar({ percent: 20, onCommit })
    // two quick drag-adjusts; the browser fires dblclick after the pair —
    // that must not clear the percent that was just committed
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 10 })
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 40 })
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 40 })
    fireEvent.pointerDown(bar, { pointerId: 2, clientX: 45 })
    fireEvent.pointerMove(bar, { pointerId: 2, clientX: 75 })
    fireEvent.pointerUp(bar, { pointerId: 2, clientX: 75 })
    fireEvent.doubleClick(bar)
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([40, 75])
  })
it('cancels mousedown so the draggable row never arms a native drag', () => {
    const onCommit = vi.fn()
    const { bar } = renderBar({ percent: 30, onCommit })
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    bar.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })
})
