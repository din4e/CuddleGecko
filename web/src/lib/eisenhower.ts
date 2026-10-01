import type { Todo, TodoPriority, TodoQuadrant, TodoUpdateInput } from '../types'

/** A todo counts as important/urgent when its axis sits at normal or high
 *  (中/高); low and none land on the "not" side of the matrix. */
export function axisIsHigh(level: TodoPriority | undefined): boolean {
  return level === 'normal' || level === 'high'
}

/** Which Eisenhower quadrant a todo belongs to. */
export function quadrantOf(todo: Pick<Todo, 'importance' | 'urgency'>): TodoQuadrant {
  const important = axisIsHigh(todo.importance)
  const urgent = axisIsHigh(todo.urgency)
  if (important) return urgent ? 'q1' : 'q2'
  return urgent ? 'q3' : 'q4'
}

/** The quadrant each key maps to, for bucketing loops. */
export const QUADRANT_ORDER: TodoQuadrant[] = ['q1', 'q2', 'q3', 'q4']

/**
 * Field overrides that move `todo` into `quadrant`, flipping only the axes
 * that are on the wrong side — a todo already marked 高 keeps its 高 when it
 * stays on the important side, and lands on 中 (the minimal "counts" tier)
 * when it crosses over. Empty result means the todo already fits.
 */
export function quadrantOverrides(
  todo: Pick<Todo, 'importance' | 'urgency'>,
  quadrant: TodoQuadrant,
): Partial<TodoUpdateInput> {
  const overrides: Partial<TodoUpdateInput> = {}
  const wantImportant = quadrant === 'q1' || quadrant === 'q2'
  const wantUrgent = quadrant === 'q1' || quadrant === 'q3'
  if (wantImportant !== axisIsHigh(todo.importance)) {
    overrides.importance = wantImportant ? 'normal' : 'none'
  }
  if (wantUrgent !== axisIsHigh(todo.urgency)) {
    overrides.urgency = wantUrgent ? 'normal' : 'none'
  }
  return overrides
}
