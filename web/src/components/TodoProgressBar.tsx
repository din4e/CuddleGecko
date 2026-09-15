import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '../lib/utils'

/** Draggable progress control for todo rows.
 *
 *  Visual: a 3px bar (muted track + emerald fill). The pointer hit area is
 *  much taller (12px) so the thin bar is easy to grab.
 *  Interaction: press-drag (or single click) sets the percent in 5-steps and
 *  commits once on release; a clean no-movement double-click clears it (a
 *  dblclick trailing a drag-adjust keeps the value). While a todo has no
 *  progress the bar is invisible until the row is hovered — then a faint
 *  empty track appears so it can be grabbed.
 *  percent=null means "not configured" (still rendered: it's the drag target).
 */
const STEP = 5

import { setBarPressActive as setBarPress } from '../lib/barGesture'

export default function TodoProgressBar({
  percent,
  onCommit,
  showLabel = false,
  className = '',
}: {
  percent: number | null
  onCommit?: (pct: number | null) => void
  /** Render the numeric percent after the bar (detail surfaces). */
  showLabel?: boolean
  className?: string
}) {
  const [dragging, setDragging] = useState(false)
  // Local value during a drag; null = follow the prop (no drag in progress).
  const [dragValue, setDragValue] = useState<number | null>(null)
  const trackRef = useRef<HTMLSpanElement>(null)
  // True when the latest interaction moved the pointer — a rapid drag-adjust
  // pair also fires dblclick, and that must NOT wipe the just-set percent.
  const draggedRef = useRef(false)

  // A committed change (new percent from the server/cache) ends any in-flight
  // drag — the bar snaps to the authoritative value.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDragValue(null)
    setDragging(false)
  }, [percent])
  /* eslint-enable react-hooks/set-state-in-effect */

  const pctFromEvent = (e: ReactPointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    return Math.round((ratio * 100) / STEP) * STEP
  }

  const show = dragValue ?? percent
  const interactive = onCommit != null

  const handlePointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!interactive) return
    e.stopPropagation()
    // preventDefault kills the row's native HTML5 drag (draggable rows would
    // otherwise start moving together with the scrub) and text selection.
    // stopPropagation alone can't stop a native dragstart; this can.
    e.preventDefault()
    // Capture keeps tracking the drag outside the bar; synthetic pointers
    // (tests, some automation) have no active pointer entry and throw — the
    // drag works without capture, so never let it abort the interaction.
    try {
      trackRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // no active pointer — continue without capture
    }
    draggedRef.current = false
    setBarPress(true)
    setDragging(true)
    setDragValue(pctFromEvent(e))
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragging) return
    e.stopPropagation()
    e.preventDefault()
    const v = pctFromEvent(e)
    draggedRef.current = draggedRef.current || v !== dragValue
    setDragValue(v)
  }
  const handlePointerUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragging) return
    e.stopPropagation()
    const v = pctFromEvent(e)
    setDragValue(null)
    setDragging(false)
    setBarPress(false)
    onCommit?.(v)
  }

  return (
    <span
      ref={trackRef}
      role={interactive ? 'slider' : 'img'}
      aria-label={show != null ? `${show}%` : undefined}
      aria-valuenow={show ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      title={interactive ? undefined : show != null ? `${show}%` : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      // Canceling pointerdown does NOT stop Chromium from arming the
      // surrounding row's native HTML5 drag (dragstart fires anyway and then
      // swallows the pointer stream — the scrub never commits). Preventing
      // mousedown — the event that actually initiates the drag — does.
      onMouseDown={(e) => {
        if (!interactive) return
        e.preventDefault()
      }}
      onDragStart={(e) => {
        // Belt-and-suspenders: the bar must never become the source of a
        // row's HTML5 drag (some browsers re-evaluate draggable mid-press).
        e.preventDefault()
      }}
      onDoubleClick={(e) => {
        // Only a clean no-movement double-click clears; the dblclick that
        // trails a rapid drag-adjust would otherwise wipe the fresh percent.
        if (!interactive || percent == null || draggedRef.current) return
        e.stopPropagation()
        draggedRef.current = false
        onCommit?.(null)
      }}
      className={cn(
        'group/bar relative flex h-3 w-10 shrink-0 cursor-default items-center',
        interactive && 'cursor-ew-resize touch-none',
        className,
      )}
    >
      <span
        className={`block h-[3px] w-full overflow-hidden rounded-full ${
          dragging
            ? // scrub in flight: show the track instantly — the opacity
              // transition would flash the bar in on the first press
              'bg-muted opacity-100 transition-none'
            : `transition-opacity ${show == null ? 'bg-muted opacity-0 group-hover/bar:opacity-100 group-hover:opacity-100' : 'bg-muted'}`
        }`}
      >
        <span
          className={`block h-full rounded-full transition-colors duration-150 ${dragging ? 'bg-emerald-500' : 'bg-emerald-500/70'}`}
          style={{ width: `${show ?? 0}%` }}
        />
      </span>
      {showLabel && (
        <span className="shrink-0 pl-1 text-[10px] tabular-nums text-muted-foreground">
          {show != null ? `${show}%` : '—'}
        </span>
      )}
    </span>
  )
}
