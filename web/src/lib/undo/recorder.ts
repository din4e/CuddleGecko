// Undo recording and execution.
//
// Recording joins two asynchronous layers that each know only half the story:
//  - MutationCache.onMutate sees every mutation BEFORE its optimistic updates
//    (they run in mutation.execute after the cache callback) but not the URL;
//  - the request layer (api/client) sees method/URL/body/result but not the
//    mutation. Requests are paired to pending mutations by matching the ids
//    in the URL/body against the ids in the mutation's variables; when that
//    is inconclusive a single in-flight mutation is assumed, and with several
//    ambiguous candidates the op simply doesn't record (undo degrades, it
//    never reverts to a wrong state).
//
// While an undo runs, recording is suppressed so inverse requests don't land
// on the stack themselves.
import type { QueryClient } from '@tanstack/react-query'
import { request, setMutatingRequestObserver } from '@/api/client'
import { invalidateScope } from '@/lib/querySync'
import i18n from '@/i18n'
import { toast } from 'sonner'
import { classify, buildUndoPlan, EMPTY_FINDERS, type SnapshotFinders, type UndoCtx, type UndoMethod, type UndoOp } from './inverse'
import { useUndoStore } from './undoStore'

type Entity = Record<string, unknown>

/** One query cache observation: [queryKey, data] pairs, references only. */
export type CacheSnapshot = ReadonlyArray<readonly [readonly unknown[], unknown]>

export interface PendingMutation {
  mutation: object
  variables: unknown
  snapshot: CacheSnapshot
  at: number
}

let qc: QueryClient | null = null
let suppressDepth = 0
let pending: PendingMutation[] = []

export function installUndoRecorder(client: QueryClient): void {
  if (qc) return
  qc = client
  setMutatingRequestObserver({ onDispatch })
}

/** MutationCache.onMutate — snapshot BEFORE the mutation's optimistic updates. */
export function noteMutationStart(mutation: object, variables: unknown): void {
  if (!qc || suppressDepth > 0) return
  pending.push({ mutation, variables, snapshot: captureCache(), at: Date.now() })
  if (pending.length > 20) pending = pending.slice(-20)
}

/** MutationCache.onSettled — drop unpaired entries so they can't mispair later. */
export function noteMutationSettled(mutation: object): void {
  pending = pending.filter((p) => p.mutation !== mutation)
}

function captureCache(): CacheSnapshot {
  // Holding references is enough: cache updates replace objects rather than
  // mutate them, so these stay the pre-mutation versions as long as we hold
  // them (shared across entries until the data actually diverges).
  return qc!.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data] as const)
}

/** Every number an id-bearing field of `variables` could refer to. */
function variableIds(variables: unknown): Set<number> {
  const ids = new Set<number>()
  const addValue = (value: unknown): void => {
    if (typeof value === 'number') ids.add(value)
    else if (Array.isArray(value)) value.forEach((v) => {
      if (typeof v === 'number') ids.add(v)
    })
  }
  if (variables == null || typeof variables !== 'object') {
    addValue(variables)
    return ids
  }
  for (const value of Object.values(variables as Entity)) {
    addValue(value)
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      for (const inner of Object.values(value as Entity)) addValue(inner)
    }
  }
  return ids
}

function numericIdsIn(value: unknown): Set<number> {
  const ids = new Set<number>()
  if (typeof value === 'number') ids.add(value)
  else if (Array.isArray(value)) value.forEach((v) => {
    if (typeof v === 'number') ids.add(v)
  })
  return ids
}

/**
 * Chooses which pending mutation a dispatched request belongs to. Pure
 * (modulo consuming the chosen entry) — exported for tests.
 */
export function pickPending(
  pendings: PendingMutation[],
  ctx: UndoCtx,
  data: unknown,
): { chosen: PendingMutation | null; rest: PendingMutation[] } {
  const wanted = new Set(ctx.ids)
  const body = (data && typeof data === 'object' ? data : {}) as Entity
  for (const key of ['ids', 'after_id', 'parent_id']) {
    for (const id of numericIdsIn(body[key])) wanted.add(id)
  }
  if (wanted.size > 0) {
    const matched = pendings.filter((p) => {
      const ids = variableIds(p.variables)
      for (const id of wanted) if (ids.has(id)) return true
      return false
    })
    if (matched.length > 0) {
      const chosen = matched[matched.length - 1]
      return { chosen, rest: pendings.filter((p) => p !== chosen) }
    }
  }
  if (pendings.length === 1) {
    const [only] = pendings
    return { chosen: only, rest: [] }
  }
  // Several in-flight mutations and no id evidence — give up on this one.
  return { chosen: null, rest: pendings }
}

function onDispatch(
  method: UndoMethod,
  url: string,
  data: unknown,
  params?: unknown,
): ((result: unknown) => void) | null {
  if (!qc || suppressDepth > 0) return null
  const ctx = classify(method, url)
  if (!ctx) return null
  pending = pending.filter((p) => Date.now() - p.at < 15_000)
  let snapshot: CacheSnapshot | null
  if (pending.length === 0) {
    // Direct API call (terminal, quick-add): no mutation, so the cache holds
    // the last-known server state — a valid pre-state snapshot.
    snapshot = captureCache()
  } else {
    const picked = pickPending(pending, ctx, data)
    pending = picked.rest
    snapshot = picked.chosen?.snapshot ?? null
  }
  const finders = snapshot ? makeFinders(snapshot) : EMPTY_FINDERS
  return (result: unknown) => {
    const plan = buildUndoPlan(ctx, { data, params, result, finders })
    if (!plan) return
    useUndoStore.getState().push({
      label: plan.label,
      mergeKey: plan.mergeKey,
      ops: plan.ops.map((op) => (results: unknown[]) => runOp(op, results)),
      scopes: plan.scopes,
    })
  }
}

async function runOp(op: UndoOp, results: unknown[]): Promise<unknown> {
  const url = typeof op.url === 'function' ? op.url(results) : op.url
  const config = op.params != null ? { params: op.params } : undefined
  switch (op.method) {
    case 'POST': return request.post(url, op.data, config)
    case 'PUT': return request.put(url, op.data, config)
    case 'PATCH': return request.patch(url, op.data, config)
    case 'DELETE': return request.delete(url, config)
  }
}

/** Pops and reverts the most recent undoable operation. */
export async function performUndo(): Promise<void> {
  const store = useUndoStore.getState()
  if (store.busy) return
  const entry = store.entries[store.entries.length - 1]
  if (!entry) {
    toast.info(i18n.t('undo.empty'))
    return
  }
  useUndoStore.getState().setBusy(true)
  suppressDepth++
  const results: unknown[] = []
  try {
    for (const op of entry.ops) results.push(await op(results))
    for (const scope of new Set(entry.scopes)) invalidateScope(qc!, scope)
    useUndoStore.getState().pop()
    toast.success(
      i18n.t('undo.done', {
        action: i18n.t(`undo.actions.${entry.label.action}`),
        entity: i18n.t(`undo.entities.${entry.label.entity}`),
      }),
    )
  } catch {
    // The inverse failed (entity changed underneath us, validation…) — the
    // entry is spent; surfacing the failure is all we can honestly do.
    useUndoStore.getState().pop()
    toast.error(i18n.t('undo.failed'))
  } finally {
    suppressDepth--
    useUndoStore.getState().setBusy(false)
  }
}

// ---- snapshot finders ----

interface ListEntry {
  key: readonly unknown[]
  items: Entity[]
}

function extractItems(data: unknown): Entity[] | null {
  if (Array.isArray(data)) return data as Entity[]
  if (data != null && typeof data === 'object') {
    const obj = data as Entity
    if ('pages' in obj && Array.isArray(obj.pages)) {
      return (obj.pages as Entity[]).flatMap((p) => {
        const items = (p as Entity)?.items
        return Array.isArray(items) ? (items as Entity[]) : []
      })
    }
    if ('items' in obj && Array.isArray(obj.items)) return obj.items as Entity[]
  }
  return null
}

function listEntriesOfScope(snapshot: CacheSnapshot, scope: string): ListEntry[] {
  const out: ListEntry[] = []
  for (const [key, data] of snapshot) {
    if (key[0] !== scope) continue
    const items = extractItems(data)
    if (items) out.push({ key, items })
  }
  return out
}

export function makeFinders(snapshot: CacheSnapshot): SnapshotFinders {
  const byScope = new Map<string, ListEntry[]>()
  const listsOf = (scope: string): ListEntry[] => {
    let lists = byScope.get(scope)
    if (!lists) {
      lists = listEntriesOfScope(snapshot, scope)
      byScope.set(scope, lists)
    }
    return lists
  }
  return {
    entity(scopes, id) {
      for (const scope of scopes) {
        for (const { items } of listsOf(scope)) {
          const found = items.find((it) => it != null && it.id === id)
          if (found) return found
        }
      }
      return undefined
    },
    prevSibling(scope, id) {
      const lists = listsOf(scope)
      // Manual-order views are the reorderable ones; prefer their cache.
      const ordered = [
        ...lists.filter((l) => (l.key[3] as Entity | undefined)?.sort === 'manual'),
        ...lists.filter((l) => (l.key[3] as Entity | undefined)?.sort !== 'manual'),
      ]
      for (const { items } of ordered) {
        const entity = items.find((it) => it != null && it.id === id)
        if (!entity) continue
        const parentId = (entity as { parent_id?: number | null }).parent_id ?? null
        const siblings = items.filter((it) => ((it as { parent_id?: number | null }).parent_id ?? null) === parentId)
        const idx = siblings.findIndex((it) => it.id === id)
        if (idx < 0) continue
        const prevId = idx === 0 ? null : siblings[idx - 1]?.id
        return typeof prevId === 'number' ? prevId : null
      }
      return undefined
    },
    subList(scope, kind, ownerIds) {
      for (const [key, data] of snapshot) {
        if (key[0] !== scope || key[2] !== kind) continue
        // Key tail after the marker must match the owner path: [items, tid],
        // [exercises, wid], [sets, wid, eid].
        const tail = key.slice(3).filter((seg) => typeof seg === 'number')
        if (tail.length !== ownerIds.length || tail.some((seg, i) => seg !== ownerIds[i])) continue
        if (Array.isArray(data)) return data as Entity[]
      }
      return undefined
    },
    boardLists(boardId) {
      for (const [key, data] of snapshot) {
        if (key[0] !== 'whiteboards' || key[2] !== 'board' || key[3] !== boardId) continue
        const obj = data as Entity | null | undefined
        const nodes = obj?.nodes
        const edges = obj?.edges
        if (Array.isArray(nodes) && Array.isArray(edges)) {
          return { nodes: nodes as Entity[], edges: edges as Entity[] }
        }
      }
      return undefined
    },
  }
}
