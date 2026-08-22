/**
 * End-to-end tests for public/dida-sync/sync-core.js — the dida365 → CG
 * importer. The core is intentionally a dependency-free IIFE (it also runs
 * inside the static /dida-sync/ page), so we eval the exact shipped file
 * (imported ?raw to avoid node typings in the app tsconfig) and drive
 * runSync() against a mocked backend, asserting on the fetch calls it
 * issues — the same contract internal/handler/todo.go implements.
 */
import syncCoreSrc from '../../../public/dida-sync/sync-core.js?raw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface DidaTask {
  id: string
  projectId?: string
  parentId?: string
  title?: string
  status?: number
  priority?: number
  sortOrder?: number
  dueDate?: string
  startDate?: string
  items?: { title?: string; status?: number }[]
}

interface DidaExport { projects: { id: string; name?: string }[]; tasks: DidaTask[] }

type SyncLog = (text: string, cls?: string) => void

interface DidaSyncApi {
  MARKER: string
  ROOT_TITLE: string
  mapPriority: (p: number) => string
  mapTime: (v?: string) => string
  runSync: (
    data: DidaExport,
    opts: { token: string; includeDone?: boolean; includeItems?: boolean; log?: SyncLog },
  ) => Promise<{ todoCount: number; itemCount: number; errorCount: number }>
}

// The IIFE attaches to `window` when one exists (jsdom here).
eval(syncCoreSrc)
const DidaSync = ((globalThis as unknown as { DidaSync?: DidaSyncApi }).DidaSync
  ?? (window as unknown as { DidaSync?: DidaSyncApi }).DidaSync) as DidaSyncApi

/* ---------- tiny in-memory backend mirroring pkg/response + todo routes ---------- */
interface Call { method: string; url: string; body: Record<string, unknown> | null }

function makeBackend(opts: { existing?: { id: number; description: string }[]; failTitle?: string } = {}) {
  const calls: Call[] = []
  let nextTodoId = 100
  let nextItemId = 500
  const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ code: 0, data, message: 'success' }) })

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    const body = init.body ? JSON.parse(init.body as string) as Record<string, unknown> : null
    calls.push({ method, url, body })

    if (method === 'GET' && url.startsWith('/api/todos')) return ok({ items: opts.existing || [] })
    if (method === 'POST' && url === '/api/todos') {
      if (opts.failTitle && body?.title === opts.failTitle) {
        return { ok: false, status: 500, json: async () => ({ code: 500, data: null, message: 'boom' }) }
      }
      return ok({ id: nextTodoId++ })
    }
    if (method === 'POST' && /^\/api\/todos\/\d+\/items$/.test(url)) return ok({ id: nextItemId++ })
    if (method === 'PATCH' && /\/items\/\d+\/toggle$/.test(url)) return ok(null)
    if (method === 'DELETE') return ok(null)
    throw new Error('unexpected request: ' + method + ' ' + url)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

const postTitles = (calls: Call[]) =>
  calls.filter((c) => c.method === 'POST' && c.url === '/api/todos').map((c) => c.body?.title as string)

/* ---------- fixtures ---------- */
const EXPORT: DidaExport = {
  projects: [{ id: 'p1', name: '工作' }],
  tasks: [
    { id: 'a', projectId: 'p1', title: '父任务', status: 0, priority: 5, sortOrder: 10,
      dueDate: '2026-08-22T03:00:00.000+0000', startDate: '' },
    { id: 'b', projectId: 'p1', parentId: 'a', title: '子任务', status: 0, priority: 0, sortOrder: 0,
      items: [{ title: '步骤一', status: 0 }, { title: '步骤二', status: 2 }] },
    { id: 'c', title: '收件箱任务', status: 2, priority: 1 },
  ],
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('mapPriority (dida 0/1/3/5 → CG low/normal/high)', () => {
  it('maps 1→low, 5→high, 0 and 3→normal', () => {
    expect(DidaSync.mapPriority(1)).toBe('low')
    expect(DidaSync.mapPriority(5)).toBe('high')
    expect(DidaSync.mapPriority(0)).toBe('normal')
    expect(DidaSync.mapPriority(3)).toBe('normal')
  })
})

describe('mapTime (dida "+0000" offsets → RFC3339)', () => {
  it('normalizes the offset and converts to ISO', () => {
    expect(DidaSync.mapTime('2026-08-22T03:00:00.000+0000')).toBe('2026-08-22T03:00:00.000Z')
    expect(DidaSync.mapTime('2026-08-22T11:00:00.000+0800')).toBe('2026-08-22T03:00:00.000Z')
  })
  it('returns empty string for missing or unparseable values', () => {
    expect(DidaSync.mapTime('')).toBe('')
    expect(DidaSync.mapTime(undefined)).toBe('')
    expect(DidaSync.mapTime('not-a-date')).toBe('')
  })
})

describe('runSync', () => {
  it('builds root → project nodes → task tree, mapping status/priority/dates', async () => {
    const { calls } = makeBackend()
    const logs: string[] = []
    const res = await DidaSync.runSync(structuredClone(EXPORT), {
      token: 'tok', includeDone: true, includeItems: true, log: (t) => logs.push(t),
    })

    // root #100 → project 工作 #101 → a #102 → b #103 → 收集箱 #104 → c #105
    const postBodies = calls
      .filter((c) => c.method === 'POST' && c.url === '/api/todos')
      .map((c) => c.body)
    expect(postBodies).toEqual([
      { title: DidaSync.ROOT_TITLE, description: expect.stringContaining(DidaSync.MARKER),
        status: 'pending', priority: 'normal', due_time: '', start_time: '', parent_id: null },
      { title: '📋 工作', description: '', status: 'pending', priority: 'normal',
        due_time: '', start_time: '', parent_id: 100 },
      { title: '父任务', description: '', status: 'pending', priority: 'high',
        due_time: '2026-08-22T03:00:00.000Z', start_time: '', parent_id: 101 },
      { title: '子任务', description: '', status: 'pending', priority: 'normal',
        due_time: '', start_time: '', parent_id: 102 },
      { title: '📋 收集箱', description: '', status: 'pending', priority: 'normal',
        due_time: '', start_time: '', parent_id: 100 },
      { title: '收件箱任务', description: '', status: 'done', priority: 'low',
        due_time: '', start_time: '', parent_id: 104 },
    ])

    // checklist items: two creates under todo #103, one toggle for the completed one
    const itemPosts = calls.filter((c) => c.method === 'POST' && /^\/api\/todos\/103\/items$/.test(c.url))
    expect(itemPosts.map((c) => c.body)).toEqual([{ content: '步骤一' }, { content: '步骤二' }])
    const toggles = calls.filter((c) => c.method === 'PATCH' && /\/toggle$/.test(c.url))
    expect(toggles).toHaveLength(1)
    expect(toggles[0].url).toBe('/api/todos/103/items/501/toggle')

    // 6 todos (root + 2 project nodes + 3 tasks), 2 items, no errors
    expect(res).toEqual({ todoCount: 6, itemCount: 2, errorCount: 0 })
    expect(logs.some((l) => l.includes('同步完成'))).toBe(true)
  })

  it('deletes previously synced roots (MARKER in description) before rebuilding', async () => {
    const { calls } = makeBackend({
      existing: [
        { id: 7, description: DidaSync.MARKER + ' 上次同步:…' },
        { id: 8, description: 'hand-written note, must survive' },
      ],
    })
    await DidaSync.runSync({ projects: [], tasks: [{ id: 'x', title: 't', status: 0 }] },
      { token: 't', log: () => {} })

    const deletes = calls.filter((c) => c.method === 'DELETE')
    expect(deletes.map((d) => d.url)).toEqual(['/api/todos/7']) // only the marked root
    expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/todos?page_size=100000' })
  })

  it('skips done tasks and checklist items per options', async () => {
    const { calls } = makeBackend()
    const res = await DidaSync.runSync(structuredClone(EXPORT),
      { token: 't', includeDone: false, includeItems: false, log: () => {} })

    // c (done, sole inbox task) vanishes entirely — no 收集箱 node either
    expect(postTitles(calls)).toEqual([DidaSync.ROOT_TITLE, '📋 工作', '父任务', '子任务'])
    expect(calls.some((c) => c.url.includes('/items'))).toBe(false)
    expect(res).toEqual({ todoCount: 4, itemCount: 0, errorCount: 0 })
  })

  it('counts failures per task, skips its subtree, keeps going with siblings', async () => {
    const { calls } = makeBackend({ failTitle: '父任务' })
    const res = await DidaSync.runSync(structuredClone(EXPORT), { token: 't', log: () => {} })

    expect(res.errorCount).toBe(1)
    expect(res.todoCount).toBe(4) // root + 工作 node + 收集箱 node + 收件箱任务
    // a's POST was attempted (and rejected); its child b and b's items are never attempted
    expect(postTitles(calls))
      .toEqual([DidaSync.ROOT_TITLE, '📋 工作', '父任务', '📋 收集箱', '收件箱任务'])
    expect(calls.some((c) => c.body?.title === '子任务')).toBe(false)
    expect(calls.some((c) => c.url.includes('/items'))).toBe(false)
  })

  it('orphan children (parent missing from export) are imported as top-level', async () => {
    const { calls } = makeBackend()
    await DidaSync.runSync(
      { projects: [], tasks: [{ id: 'k', projectId: 'p', title: '孤儿', status: 0, parentId: 'ghost' }] },
      { token: 't', log: () => {} })
    // p is unknown → named by id; orphan k still imported under the project node
    expect(postTitles(calls)).toEqual([DidaSync.ROOT_TITLE, '📋 p', '孤儿'])
  })
})
