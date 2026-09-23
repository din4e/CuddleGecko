// Global undo — pure request→inverse mapping.
//
// Every mutating request that goes through api/client's `request` object is
// classified here into an UndoCtx (resource + path ids + action tail), and
// buildUndoPlan() turns it into the API calls that revert it. The module has
// no side effects: cache lookups arrive via the injected SnapshotFinders and
// the plan is plain data (ops may reference earlier op results so recreated
// entities can be re-linked, e.g. re-applying tags to a recreated contact).
//
// Pre-state correctness: finders run against a snapshot of the query cache
// taken BEFORE the mutation's optimistic updates (MutationCache.onMutate fires
// before each mutation's own onMutate), so inverses restore the pre-edit
// entity, not the optimistic projection of it.

export type UndoMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface UndoOp {
  method: UndoMethod
  /** Literal URL, or one derived from earlier op results (results[0].id …). */
  url: string | ((results: unknown[]) => string)
  data?: unknown
  /** Query params (habit check-in date, …) replayed on the inverse. */
  params?: unknown
}

export type UndoAction = 'create' | 'update' | 'delete' | 'toggle' | 'move' | 'bulk'

export interface UndoLabel {
  action: UndoAction
  /** i18n key under undo.entities.* */
  entity: string
}

export interface UndoPlan {
  ops: UndoOp[]
  /** Query scopes to invalidate once all ops succeed. */
  scopes: string[]
  label: UndoLabel
  /** Identity for merging consecutive updates (auto-save bursts). */
  mergeKey: string
}

export interface UndoCtx {
  method: UndoMethod
  url: string
  resource: string
  /** Query scope that caches this resource's lists. */
  scope: string
  /** Numeric path segments in order (e.g. /todos/5/items/9 → [5, 9]). */
  ids: number[]
  /** Non-numeric segments after the resource (['items', 'toggle'], ['tags']). */
  tail: string[]
}

interface ResourceInfo {
  scope: string
  entity: string
  /** Extra scopes to invalidate when the entity is created/deleted. */
  crossScopes?: string[]
  /** Resources whose CREATE endpoint is nested under an owner, not /resource. */
  createUrl?: (pre: Entity) => string | null
}

type Entity = Record<string, unknown>

// URL resource segment → query scope + label. Everything else (auth, ai,
// export/import, settings, workspaces, pomodoros, upload…) is not undoable.
const RESOURCES: Record<string, ResourceInfo> = {
  buddies: { scope: 'contacts', entity: 'contacts', crossScopes: ['reminders'] },
  interactions: {
    scope: 'contacts',
    entity: 'interactions',
    crossScopes: ['contacts'],
    createUrl: (pre) => (typeof pre.contact_id === 'number' ? `/buddies/${pre.contact_id}/interactions` : null),
  },
  relations: {
    scope: 'contacts',
    entity: 'relations',
    crossScopes: ['contacts'],
    createUrl: (pre) => (typeof pre.contact_id_a === 'number' ? `/buddies/${pre.contact_id_a}/relations` : null),
  },
  reminders: {
    scope: 'reminders',
    entity: 'reminders',
    crossScopes: ['contacts'],
    createUrl: (pre) => (typeof pre.contact_id === 'number' ? `/buddies/${pre.contact_id}/reminders` : null),
  },
  events: { scope: 'events', entity: 'events' },
  todos: { scope: 'todos', entity: 'todos' },
  workouts: { scope: 'workouts', entity: 'workouts' },
  transactions: { scope: 'transactions', entity: 'transactions' },
  habits: { scope: 'habits', entity: 'habits' },
  whiteboards: { scope: 'whiteboards', entity: 'whiteboards' },
  'body-metrics': { scope: 'body-metrics', entity: 'body-metrics' },
  'fitness-goals': { scope: 'fitness-goals', entity: 'fitness-goals' },
  'exercise-library': { scope: 'exercise-library', entity: 'exercise-library' },
  'workout-templates': { scope: 'workout-templates', entity: 'workout-templates' },
  tags: { scope: 'tags', entity: 'tags' },
}

export function classify(method: UndoMethod, url: string): UndoCtx | null {
  const segments = (url.split('?')[0] ?? '').split('/').filter(Boolean)
  const info = RESOURCES[segments[0] ?? '']
  if (!info) return null
  const rest = segments.slice(1)
  const ids: number[] = []
  const tail: string[] = []
  for (const seg of rest) {
    if (/^\d+$/.test(seg)) ids.push(Number(seg))
    else tail.push(seg)
  }
  return { method, url, resource: segments[0], scope: info.scope, ids, tail }
}

export interface SnapshotFinders {
  /** Pre-mutation entity by id, searched across the given scopes' cached lists. */
  entity(scopes: string[], id: number): Entity | undefined
  /**
   * Id of the sibling preceding `id` in the cached (server) order of `scope`,
   * within the entity's own parent group. null = it was first;
   * undefined = no cached order for it.
   */
  prevSibling(scope: string, id: number): number | null | undefined
  /** Cached owned sub-list: ('todos','items',[tid]) / ('workouts','exercises',[wid]) / ('workouts','sets',[wid,eid]). */
  subList(scope: string, kind: string, ownerIds: number[]): Entity[] | undefined
  /** Cached whiteboard board detail (nodes + edges). */
  boardLists(boardId: number): { nodes: Entity[]; edges: Entity[] } | undefined
}

// Finders over no snapshot: pre-state lookups miss, so only pre-free inverses
// (create→delete, toggle involution, …) still build.
export const EMPTY_FINDERS: SnapshotFinders = {
  entity: () => undefined,
  prevSibling: () => undefined,
  subList: () => undefined,
  boardLists: () => undefined,
}

function pick(source: Entity, keys: string[]): Entity {
  const out: Entity = {}
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

// Todos and workouts bind nullable fields as plain values plus explicit
// clear_* flags (handler request structs), so restoring a null must send the
// flag — sending null alone would be read as "leave unchanged".
function todoPayload(pre: Entity): Entity {
  return {
    title: pre.title ?? '',
    description: pre.description ?? '',
    status: pre.status ?? 'pending',
    priority: pre.priority ?? 'normal',
    due_time: pre.due_time ?? '',
    clear_due_time: pre.due_time == null,
    start_time: pre.start_time ?? '',
    clear_start_time: pre.start_time == null || pre.start_time === '',
    duration: pre.duration ?? 0,
    clear_duration: !pre.duration,
    amount: pre.amount ?? null,
    clear_amount: pre.amount == null,
    amount_type: pre.amount_type ?? 'expense',
    progress: pre.progress ?? null,
    clear_progress: pre.progress == null,
    contact_ids: pre.contact_ids ?? [],
    color: pre.color ?? '',
    repeat: pre.repeat ?? '',
    repeat_interval: pre.repeat_interval ?? 1,
  }
}

function workoutPayload(pre: Entity): Entity {
  return {
    name: pre.name ?? '',
    type: pre.type ?? 'strength',
    status: pre.status ?? 'planned',
    intensity: pre.intensity ?? 'moderate',
    scheduled_at: pre.scheduled_at ?? '',
    clear_scheduled_at: pre.scheduled_at == null,
    duration_min: pre.duration_min ?? null,
    clear_duration_min: pre.duration_min == null,
    calories: pre.calories ?? null,
    clear_calories: pre.calories == null,
    color: pre.color ?? '',
    location: pre.location ?? '',
    notes: pre.notes ?? '',
  }
}

function itemPayload(pre: Entity): Entity {
  return { content: pre.content ?? '', due_time: pre.due_time ?? '', clear_due_time: pre.due_time == null }
}

function exercisePayload(pre: Entity): Entity {
  return pick(pre, ['name', 'category', 'sets', 'reps', 'weight', 'distance', 'duration_sec', 'rest_sec', 'done', 'sort_order', 'notes'])
}

function setPayload(pre: Entity): Entity {
  return pick(pre, ['set_index', 'reps', 'weight', 'distance', 'duration_sec', 'done', 'notes'])
}

function templatePayload(pre: Entity): Entity {
  const items = Array.isArray(pre.items)
    ? (pre.items as Entity[]).map((it) => pick(it, ['name', 'category', 'sets', 'reps', 'weight', 'distance', 'duration_sec', 'rest_sec', 'sort_order']))
    : []
  return { ...pick(pre, ['name', 'type', 'notes']), items }
}

function nodePayload(pre: Entity): Entity {
  return pick(pre, ['ref_type', 'ref_id', 'label', 'note', 'x', 'y', 'color'])
}

function edgePayload(pre: Entity): Entity {
  return pick(pre, ['from_node_id', 'to_node_id', 'label'])
}

// Fields each resource accepts on create/update. Handler request structs bind
// a known subset of these; unknown JSON keys are ignored, virtual/denormalized
// fields are simply not listed.
const PAYLOAD_FIELDS: Record<string, string[]> = {
  buddies: ['name', 'nickname', 'avatar_emoji', 'avatar_url', 'phones', 'emails', 'birthday', 'birthday_calendar', 'notes', 'relationship_labels'],
  tags: ['name', 'color'],
  interactions: ['type', 'title', 'content', 'occurred_at'],
  reminders: ['title', 'description', 'remind_at', 'status'],
  events: ['title', 'description', 'start_time', 'end_time', 'location', 'contact_ids', 'color'],
  transactions: ['title', 'amount', 'type', 'category', 'contact_ids', 'date', 'notes'],
  habits: ['name', 'color', 'emoji', 'frequency', 'archived', 'sort_order'],
  'body-metrics': [
    'recorded_at', 'weight', 'height', 'body_fat', 'muscle_mass', 'resting_hr', 'systolic', 'diastolic',
    'sleep_hours', 'bedtime', 'wake_time', 'sleep_score', 'steps', 'energy', 'mood', 'notes',
  ],
  'fitness-goals': ['type', 'target_value', 'deadline', 'status'],
  'exercise-library': ['name', 'category', 'muscle_groups', 'equipment', 'notes'],
  whiteboards: ['name'],
}

function updatePayload(resource: string, pre: Entity): Entity {
  switch (resource) {
    case 'todos': return todoPayload(pre)
    case 'workouts': return workoutPayload(pre)
    case 'workout-templates': return templatePayload(pre)
    case 'workout-exercises': return exercisePayload(pre)
    case 'workout-sets': return setPayload(pre)
    case 'whiteboard-nodes': return nodePayload(pre)
    case 'whiteboard-edges': return edgePayload(pre)
    default: return pick(pre, PAYLOAD_FIELDS[resource] ?? [])
  }
}

function createdId(result: unknown): number | null {
  const id = (result as Entity | null | undefined)?.id
  return typeof id === 'number' ? id : null
}

function tagIdsOf(pre: Entity | undefined): number[] | null {
  const tags = pre?.tags
  if (!Array.isArray(tags)) return null
  return tags.map((t) => (t as Entity)?.id).filter((id): id is number => typeof id === 'number')
}

interface BuildInput {
  data?: unknown
  params?: unknown
  result?: unknown
  finders: SnapshotFinders
}

/**
 * Builds the plan that reverts one already-succeeded request. Returns null
 * when the request is not undoable or the pre-state needed for the inverse
 * is unavailable — undo then silently doesn't record rather than revert to
 * a wrong state.
 */
export function buildUndoPlan(ctx: UndoCtx, input: BuildInput): UndoPlan | null {
  const { resource, ids, tail, method } = ctx
  const info = RESOURCES[resource]
  const { data, params, result, finders } = input
  const body = (data && typeof data === 'object' ? data : {}) as Entity
  const act = tail[0]
  const sub = tail[1]
  const label = (action: UndoAction, entity = info.entity): UndoLabel => ({ action, entity })
  const scopes = (...extra: string[]): string[] => Array.from(new Set([info.scope, ...(info.crossScopes ?? []), ...extra]))

  // ---- collection create: POST /resource (no ids in the path) ----
  if (method === 'POST' && ids.length === 0 && !act) {
    const id = createdId(result)
    if (id == null) return null
    return { ops: [{ method: 'DELETE', url: `/${resource}/${id}` }], scopes: scopes(), label: label('create'), mergeKey: `create:${resource}:${id}` }
  }

  // ---- POST with an owner id in the path: nested creates + actions ----
  if (method === 'POST' && ids.length >= 1) {
    const id = createdId(result)

    // Habit check-in toggles the day's record — posting again reverts it.
    if (resource === 'habits' && act === 'checkin') {
      return { ops: [{ method: 'POST', url: ctx.url, params }], scopes: ['habits'], label: label('toggle', 'checkin'), mergeKey: `checkin:${ids[0]}` }
    }
    if (resource === 'todos' && act === 'restore') {
      return { ops: [{ method: 'DELETE', url: `/todos/${ids[0]}` }], scopes: ['todos'], label: label('delete'), mergeKey: `restore:${ids[0]}` }
    }
    if (resource === 'todos' && act === 'pomodoro') return null // counter increment, no inverse endpoint

    if (id == null) return null
    if (resource === 'buddies' && act === 'interactions') {
      return { ops: [{ method: 'DELETE', url: `/interactions/${id}` }], scopes: ['contacts'], label: label('create', 'interactions'), mergeKey: `create:interactions:${id}` }
    }
    if (resource === 'buddies' && (act === 'reminders' || act === 'birthday-reminder')) {
      return { ops: [{ method: 'DELETE', url: `/reminders/${id}` }], scopes: ['reminders', 'contacts'], label: label('create', 'reminders'), mergeKey: `create:reminders:${id}` }
    }
    if (resource === 'buddies' && act === 'relations') {
      return { ops: [{ method: 'DELETE', url: `/relations/${id}` }], scopes: ['contacts'], label: label('create', 'relations'), mergeKey: `create:relations:${id}` }
    }
    // Promote turns a checklist item into a standalone todo (item is removed):
    // remove the new todo and re-create the item in its parent. Checked before
    // plain item-create — its POST response id is a TODO id, not an item id.
    if (resource === 'todos' && act === 'items' && sub === 'promote') {
      const [tid, iid] = ids
      const pre = finders.subList('todos', 'items', [tid])?.find((it) => it?.id === iid)
      const ops: UndoOp[] = [{ method: 'DELETE', url: `/todos/${id}` }]
      if (pre) ops.push({ method: 'POST', url: `/todos/${tid}/items`, data: itemPayload(pre) })
      return { ops, scopes: ['todos'], label: label('create', 'items'), mergeKey: `promote:items:${iid}` }
    }
    if (resource === 'todos' && act === 'items') {
      return { ops: [{ method: 'DELETE', url: `/todos/${ids[0]}/items/${id}` }], scopes: ['todos'], label: label('create', 'items'), mergeKey: `create:items:${id}` }
    }
    if (resource === 'todos' && act === 'duplicate') {
      return { ops: [{ method: 'DELETE', url: `/todos/${id}` }], scopes: ['todos'], label: label('create'), mergeKey: `create:duplicate:${id}` }
    }
    if (resource === 'todos' && act === 'sync-event') {
      return { ops: [{ method: 'DELETE', url: `/events/${id}` }], scopes: ['todos', 'events'], label: { action: 'create', entity: 'events' }, mergeKey: `create:sync-event:${id}` }
    }
    if (resource === 'workouts' && act === 'exercises') {
      return { ops: [{ method: 'DELETE', url: `/workouts/${ids[0]}/exercises/${id}` }], scopes: ['workouts'], label: label('create', 'exercises'), mergeKey: `create:exercises:${id}` }
    }
    if (resource === 'workouts' && act === 'sets') {
      const [wid, eid] = ids
      return { ops: [{ method: 'DELETE', url: `/workouts/${wid}/exercises/${eid}/sets/${id}` }], scopes: ['workouts'], label: label('create', 'sets'), mergeKey: `create:sets:${id}` }
    }
    if (resource === 'whiteboards' && act === 'nodes') {
      return { ops: [{ method: 'DELETE', url: `/whiteboards/${ids[0]}/nodes/${id}` }], scopes: ['whiteboards'], label: label('create', 'nodes'), mergeKey: `create:nodes:${id}` }
    }
    if (resource === 'whiteboards' && act === 'edges') {
      return { ops: [{ method: 'DELETE', url: `/whiteboards/${ids[0]}/edges/${id}` }], scopes: ['whiteboards'], label: label('create', 'edges'), mergeKey: `create:edges:${id}` }
    }
    return null
  }

  // ---- bulk actions: POST /todos/bulk {ids, action} ----
  if (method === 'POST' && resource === 'todos' && act === 'bulk' && ids.length === 0) {
    const idsIn = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((v): v is number => typeof v === 'number') : []
    if (idsIn.length === 0) return null
    const action = typeof body.action === 'string' ? body.action : ''
    const ops: UndoOp[] = []
    for (const id of idsIn) {
      if (action === 'delete') {
        ops.push({ method: 'POST', url: `/todos/${id}/restore` })
        continue
      }
      const pre = finders.entity(['todos'], id)
      if (!pre) return null // can't rebuild every row's pre-state — skip undo
      ops.push({ method: 'PUT', url: `/todos/${id}`, data: todoPayload(pre) })
    }
    return { ops, scopes: ['todos'], label: label('bulk'), mergeKey: `bulk:${idsIn.join(',')}:${action}` }
  }

  // ---- plain update: PUT /resource/:id ----
  if (method === 'PUT' && ids.length === 1 && !act) {
    const pre = finders.entity([info.scope], ids[0])
    if (!pre) return null
    return {
      ops: [{ method: 'PUT', url: ctx.url, data: updatePayload(resource, pre) }],
      scopes: scopes(),
      label: label('update'),
      mergeKey: `update:${resource}:${ids[0]}`,
    }
  }

  // ---- tag association: PUT /resource/:id/tags {tag_ids} ----
  if (method === 'PUT' && act === 'tags' && ids.length === 1) {
    const pre = finders.entity([info.scope], ids[0])
    const tagIds = pre ? tagIdsOf(pre) : null
    if (!tagIds) return null
    return {
      ops: [{ method: 'PUT', url: ctx.url, data: { tag_ids: tagIds } }],
      scopes: scopes(),
      label: label('update'),
      mergeKey: `tags:${resource}:${ids[0]}`,
    }
  }

  // ---- plain delete: DELETE /resource/:id ----
  if (method === 'DELETE' && ids.length === 1 && !act) {
    // Todos soft-delete (trash, subtree intact) — restore is the exact inverse.
    if (resource === 'todos') {
      return { ops: [{ method: 'POST', url: `/todos/${ids[0]}/restore` }], scopes: ['todos'], label: label('delete'), mergeKey: `delete:todos:${ids[0]}` }
    }
    const pre = finders.entity([info.scope, ...(info.crossScopes ?? [])], ids[0])
    if (!pre) return null
    const createUrl = info.createUrl?.(pre) ?? `/${resource}`
    if (createUrl === null) return null
    const ops: UndoOp[] = [{ method: 'POST', url: createUrl, data: updatePayload(resource, pre) }]
    // Recreated contacts get a new id — re-apply their tags on the new id.
    if (resource === 'buddies') {
      const tagIds = tagIdsOf(pre)
      if (tagIds && tagIds.length > 0) {
        ops.push({ method: 'PUT', url: (results) => `/buddies/${createdId(results[0]) ?? ids[0]}/tags`, data: { tag_ids: tagIds } })
      }
    }
    if (resource === 'relations') {
      // Relations bind contact_id_a in the URL; keep only the peer + type.
      ops[0] = { method: 'POST', url: createUrl, data: pick(pre, ['contact_id_b', 'relation_type']) }
    }
    return { ops, scopes: scopes(), label: label('delete'), mergeKey: `delete:${resource}:${ids[0]}` }
  }

  // ---- PATCH actions on /todos/:id ----
  if (resource === 'todos' && ids.length === 1 && method === 'PATCH') {
    const id = ids[0]
    switch (act) {
      case 'toggle': {
        // Recurring todos advance their due date instead of flipping status —
        // only a full restore reverts that; plain toggles are their own inverse.
        const pre = finders.entity(['todos'], id)
        if (pre && pre.repeat) {
          return { ops: [{ method: 'PUT', url: `/todos/${id}`, data: todoPayload(pre) }], scopes: ['todos'], label: label('toggle'), mergeKey: `toggle:todos:${id}` }
        }
        return { ops: [{ method: 'PATCH', url: ctx.url }], scopes: ['todos'], label: label('toggle'), mergeKey: `toggle:todos:${id}` }
      }
      case 'pin':
        return { ops: [{ method: 'PATCH', url: ctx.url }], scopes: ['todos'], label: label('toggle'), mergeKey: `pin:todos:${id}` }
      case 'status': {
        const pre = finders.entity(['todos'], id)
        if (!pre) return null
        return { ops: [{ method: 'PATCH', url: ctx.url, data: { status: pre.status } }], scopes: ['todos'], label: label('toggle'), mergeKey: `status:todos:${id}` }
      }
      case 'progress': {
        const pre = finders.entity(['todos'], id)
        if (!pre) return null
        const value = pre.progress
        return {
          ops: [{ method: 'PATCH', url: ctx.url, data: value == null ? { clear: true } : { progress: value } }],
          scopes: ['todos'],
          label: label('update'),
          mergeKey: `progress:todos:${id}`,
        }
      }
      case 'reorder': {
        const prev = finders.prevSibling('todos', id)
        if (prev === undefined) return null
        return { ops: [{ method: 'PATCH', url: ctx.url, data: { after_id: prev } }], scopes: ['todos'], label: label('move'), mergeKey: `reorder:todos:${id}` }
      }
      case 'move': {
        const pre = finders.entity(['todos'], id)
        if (!pre) return null
        const prev = finders.prevSibling('todos', id)
        if (prev === undefined) return null
        return {
          ops: [{ method: 'PATCH', url: ctx.url, data: { parent_id: pre.parent_id ?? null, after_id: prev } }],
          scopes: ['todos'],
          label: label('move'),
          mergeKey: `move:todos:${id}`,
        }
      }
      default:
        return null
    }
  }

  // ---- todo checklist items (PUT / DELETE / PATCH …/toggle|reorder) ----
  if (resource === 'todos' && act === 'items' && ids.length === 2) {
    const [tid, iid] = ids
    const items = finders.subList('todos', 'items', [tid])
    const pre = items?.find((it) => it?.id === iid)
    if (method === 'PUT') {
      if (!pre) return null
      return { ops: [{ method: 'PUT', url: ctx.url, data: itemPayload(pre) }], scopes: ['todos'], label: label('update', 'items'), mergeKey: `update:items:${iid}` }
    }
    if (method === 'DELETE') {
      if (!pre) return null
      return { ops: [{ method: 'POST', url: `/todos/${tid}/items`, data: itemPayload(pre) }], scopes: ['todos'], label: label('create', 'items'), mergeKey: `delete:items:${iid}` }
    }
    if (method === 'PATCH' && sub === 'toggle') {
      return { ops: [{ method: 'PATCH', url: ctx.url }], scopes: ['todos'], label: label('toggle', 'items'), mergeKey: `toggle:items:${iid}` }
    }
    if (method === 'PATCH' && sub === 'reorder') {
      const prev = items ? prevInList(items, iid) : undefined
      if (prev === undefined) return null
      return { ops: [{ method: 'PATCH', url: ctx.url, data: { after_id: prev } }], scopes: ['todos'], label: label('move', 'items'), mergeKey: `reorder:items:${iid}` }
    }
    return null
  }

  // ---- workouts: PATCH toggle / reorder on the workout itself ----
  if (resource === 'workouts' && method === 'PATCH' && ids.length === 1) {
    const id = ids[0]
    if (act === 'toggle') {
      return { ops: [{ method: 'PATCH', url: ctx.url }], scopes: ['workouts'], label: label('toggle'), mergeKey: `toggle:workouts:${id}` }
    }
    if (act === 'reorder') {
      const prev = finders.prevSibling('workouts', id)
      if (prev === undefined) return null
      return { ops: [{ method: 'PATCH', url: ctx.url, data: { after_id: prev } }], scopes: ['workouts'], label: label('move'), mergeKey: `reorder:workouts:${id}` }
    }
    return null
  }

  // ---- workout exercises & sets (sets nest under an exercise in the URL) ----
  if (resource === 'workouts' && act === 'exercises' && ids.length >= 2) {
    const [wid, xid, sid] = ids
    // /workouts/5/exercises/9… is an exercise op; /workouts/5/exercises/9/sets/3… a set op.
    const isSet = sub === 'sets'
    const entityKey = isSet ? 'sets' : 'exercises'
    const itemId = isSet ? sid : xid
    const listUrl = isSet ? `/workouts/${wid}/exercises/${xid}/sets` : `/workouts/${wid}/exercises`
    const payloadKey = isSet ? 'workout-sets' : 'workout-exercises'
    const pre = isSet
      ? finders.subList('workouts', 'sets', [wid, xid])?.find((s) => s?.id === itemId)
      : finders.subList('workouts', 'exercises', [wid])?.find((e) => e?.id === itemId)
    if (method === 'PATCH' && sub === 'toggle') {
      return { ops: [{ method: 'PATCH', url: ctx.url }], scopes: ['workouts'], label: label('toggle', entityKey), mergeKey: `toggle:${entityKey}:${itemId}` }
    }
    if (method === 'PUT') {
      if (!pre) return null
      return { ops: [{ method: 'PUT', url: ctx.url, data: updatePayload(payloadKey, pre) }], scopes: ['workouts'], label: label('update', entityKey), mergeKey: `update:${entityKey}:${itemId}` }
    }
    if (method === 'DELETE') {
      if (!pre) return null
      return { ops: [{ method: 'POST', url: listUrl, data: updatePayload(payloadKey, pre) }], scopes: ['workouts'], label: label('create', entityKey), mergeKey: `delete:${entityKey}:${itemId}` }
    }
    return null
  }

  // ---- whiteboard nodes / edges (board detail cache) ----
  if (resource === 'whiteboards' && (act === 'nodes' || act === 'edges') && ids.length === 2) {
    const [bid, nid] = ids
    const kind = act === 'nodes' ? 'nodes' : 'edges'
    const board = finders.boardLists(bid)
    const pre = board?.[kind]?.find((el) => el?.id === nid)
    if (!pre) return null
    const payload = kind === 'nodes' ? nodePayload(pre) : edgePayload(pre)
    if (method === 'PUT') {
      return { ops: [{ method: 'PUT', url: ctx.url, data: payload }], scopes: ['whiteboards'], label: label('update', kind), mergeKey: `update:${kind}:${nid}` }
    }
    if (method === 'DELETE') {
      return { ops: [{ method: 'POST', url: `/whiteboards/${bid}/${kind}`, data: payload }], scopes: ['whiteboards'], label: label('create', kind), mergeKey: `delete:${kind}:${nid}` }
    }
    return null
  }

  return null
}

function prevInList(items: Entity[], id: number): number | null | undefined {
  const idx = items.findIndex((it) => it?.id === id)
  if (idx < 0) return undefined
  const prevId = idx === 0 ? null : items[idx - 1]?.id
  return typeof prevId === 'number' ? prevId : null
}
