// Real-time cache sync: applies inbound "data.changed" WS frames to the
// TanStack Query cache, and guards against the echo (the server broadcasts to
// every workspace client including the one whose HTTP mutation triggered it,
// so without the guard the same change would be applied twice).
import type { QueryClient } from '@tanstack/react-query'
import type { DataChangedMessage } from './wsSync'

// A scope whose local mutations recently invalidated the cache — WS frames for
// it within ECHO_WINDOW_MS are dropped (the mutation already refreshed state).
const ECHO_WINDOW_MS = 1000
const lastLocalMutation = new Map<string, number>()

/** Invalidates a scope's queries, remembering the moment for echo suppression. */
export function invalidateScope(qc: QueryClient, scope: string): void {
  lastLocalMutation.set(scope, Date.now())
  void qc.invalidateQueries({ queryKey: [scope] })
}

function recentlyMutatedLocally(scope: string): boolean {
  const at = lastLocalMutation.get(scope)
  return at != null && Date.now() - at < ECHO_WINDOW_MS
}

/** Marks a scope as locally mutated — inbound WS frames for it are echo. */
export function markLocalMutation(scope: string): void {
  lastLocalMutation.set(scope, Date.now())
}

interface Identifiable {
  id: number
}

// Cached list data comes in three shapes: a bare array (habits, goals, …),
// PaginatedData { items } (most lists) and InfiniteData { pages: [...] } (the
// todo timeline). mapListEntries applies fn to the entity list of any of them,
// preserving the outer shape; returns null when data matches no known shape.
function mapListEntries<T>(data: unknown, fn: (items: T[]) => T[]): unknown {
  if (Array.isArray(data)) return fn(data as T[])
  if (data != null && typeof data === 'object') {
    if ('pages' in data) {
      const inf = data as { pages: Array<Record<string, unknown>> }
      return { ...data, pages: inf.pages.map((p) => mapListEntries(p, fn)) }
    }
    if ('items' in data) {
      const page = data as { items: T[] }
      return { ...data, items: fn(page.items ?? []) }
    }
  }
  return null
}

/** Replaces the entity with id in every cached list of the scope. */
export function patchEntityInScope(qc: QueryClient, scope: string, entity: Identifiable): void {
  for (const [key, data] of qc.getQueriesData({ queryKey: [scope] })) {
    const next = mapListEntries<Identifiable>(data, (items) =>
      items.map((it) => (it != null && it.id === entity.id ? { ...it, ...entity } : it)),
    )
    if (next != null) qc.setQueryData(key, next)
  }
}

/** Removes the entity with id from every cached list of the scope. */
export function removeEntityFromScope(qc: QueryClient, scope: string, id: number): void {
  for (const [key, data] of qc.getQueriesData({ queryKey: [scope] })) {
    const next = mapListEntries<Identifiable>(data, (items) => items.filter((it) => it == null || it.id !== id))
    if (next != null) qc.setQueryData(key, next)
  }
}

/**
 * Applies one inbound frame to the query cache:
 * - updated + entity → patch lists in place (zero requests)
 * - deleted → remove from lists in place (zero requests)
 * - created / updated-without-entity / items_changed → refetch the scope's
 *   list subtree; bulk → refetch the whole scope
 * Remote frames only: when this client just mutated the same scope the frame
 * is an echo and is dropped (its own mutation already refreshed the cache).
 */
export function applyDataChanged(qc: QueryClient, msg: DataChangedMessage): void {
  const scope = msg.resource
  if (!scope) return
  if (recentlyMutatedLocally(scope)) return

  switch (msg.kind) {
    case 'updated':
      if (msg.entity && typeof msg.entity.id === 'number') {
        patchEntityInScope(qc, scope, msg.entity as unknown as Identifiable)
      } else {
        void qc.invalidateQueries({ queryKey: [scope, ...workspaceTail(), 'list'] })
      }
      break
    case 'deleted':
      if (msg.id) {
        removeEntityFromScope(qc, scope, msg.id)
      } else {
        void qc.invalidateQueries({ queryKey: [scope] })
      }
      break
    case 'created':
      // Which filtered/paginated lists should gain the new entity is not
      // derivable client-side — refetch them.
      void qc.invalidateQueries({ queryKey: [scope, ...workspaceTail(), 'list'] })
      break
    case 'items_changed':
    case 'bulk':
    default:
      void qc.invalidateQueries({ queryKey: [scope] })
      break
  }
}

// The dispatcher runs above the hooks layer (no React context), so it can't
// call rootKey(); replicate its workspace segment from localStorage instead.
// Keys are [scope, workspaceKey, ...] — matching the prefix keeps invalidation
// scoped to the active workspace ('default' when unset, same as workspaceKey()).
function workspaceTail(): unknown[] {
  return [localStorage.getItem('current_workspace_id') ?? 'default']
}
