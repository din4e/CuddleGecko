/**
 * Shared drag-and-drop helpers for the todo views.
 */

export type CardDropZone = 'top' | 'middle' | 'bottom'

/**
 * Which part of the hovered card the dragged card overlaps — the tri-zone
 * semantics shared with the tree view: edges insert (reorder), middle nests
 * (become a child). Compares the dragged card's center against the hovered
 * card's rect; falls back to "middle" when rects are unavailable (jsdom,
 * keyboard drags) so nesting stays reachable without pointer geometry.
 */
export function cardDropZone(
  activeRect: { top: number; height: number } | null | undefined,
  overRect: { top: number; height: number } | null | undefined,
): CardDropZone {
  if (!activeRect || !overRect || overRect.height <= 0) return 'middle'
  const rel = (activeRect.top + activeRect.height / 2 - overRect.top) / overRect.height
  if (rel < 0.25) return 'top'
  if (rel > 0.75) return 'bottom'
  return 'middle'
}
