import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** Draggable progress control for todo rows.
 *
 *  Visual: a 3px bar (muted track + emerald fill). The pointer hit area is
 *  much taller (12px) so the thin bar is easy to grab.
 *  Interaction: press-drag (or single click) sets the percent in 5-steps and
 *  commits once on release; double-click clears it. While a todo has no
 *  progress the bar is invisible until the row is hovered — then a faint
 *  empty track appears so it can be grabbed.
 *  percent=null means "not configured" (still rendered: it's the drag target).
 */
const STEP = 5

export default function TodoProgressBar({
  percent,
  onCommit,
  className = '',
}: {
  percent: number | null
  onCommit?: (pct: number | null) => void
  className?: string
}) {
  const [dragging, setDragging] = useState(false)
  // Local value during a drag; null = follow the prop (no drag in progress).
  const [dragValue, setDragValue] = useState<number | null>(null)
  const trackRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    setDragValue(null)
    setDragging(false)
  }, [percent])

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
    setDragging(true)
    setDragValue(pctFromEvent(e))
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragging) return
    e.stopPropagation()
    e.preventDefault()
    setDragValue(pctFromEvent(e))
  }
  const handlePointerUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragging) return
    e.stopPropagation()
    const v = pctFromEvent(e)
    setDragValue(null)
    setDragging(false)
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
      onDragStart={(e) => {
        // Belt-and-suspenders: the bar must never become the source of a
        // row's HTML5 drag (some browsers re-evaluate draggable mid-press).
        e.preventDefault()
      }}
      onDoubleClick={(e) => {
        if (!interactive || percent == null) return
        e.stopPropagation()
        onCommit?.(null)
      }}
      className={`group/bar relative flex h-3 w-10 shrink-0 cursor-default items-center ${interactive ? 'cursor-ew-resize touch-none' : ''} ${className}`}
    >
      <span
        className={`block h-[3px] w-full overflow-hidden rounded-full transition-opacity ${
          show == null ? 'bg-muted opacity-0 group-hover/bar:opacity-100 group-hover:opacity-100' : 'bg-muted'
        }`}
      >
        <span
          className={`block h-full rounded-full ${dragging ? 'bg-emerald-500' : 'bg-emerald-500/70'}`}
          style={{ width: `${show ?? 0}%` }}
        />
      </span>
    </span>
  )
}
