import { describe, it, expect, vi, beforeEach } from 'vitest'
import { todosApi } from '../todos'

vi.mock('../client', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { request } from '../client'

const mockRequest = vi.mocked(request)

describe('todosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('list() calls GET /todos with default pagination', async () => {
    mockRequest.get.mockResolvedValue([])
    await todosApi.list()
    expect(mockRequest.get).toHaveBeenCalledWith('/todos', { params: { page: 1, page_size: 50 } })
  })

  it('list(params) calls GET /todos with filters and pagination', async () => {
    mockRequest.get.mockResolvedValue([])
    await todosApi.list({ status: 'pending', sort: 'priority', q: 'milk' })
    expect(mockRequest.get).toHaveBeenCalledWith('/todos', { params: { page: 1, page_size: 50, status: 'pending', sort: 'priority', q: 'milk' } })
  })

  it('stats() calls GET /todos/stats', async () => {
    mockRequest.get.mockResolvedValue({ total: 1 })
    await todosApi.stats()
    expect(mockRequest.get).toHaveBeenCalledWith('/todos/stats')
  })

  it('listTrash() calls GET /todos/trash', async () => {
    mockRequest.get.mockResolvedValue([])
    await todosApi.listTrash()
    expect(mockRequest.get).toHaveBeenCalledWith('/todos/trash')
  })

  it('restore(id) calls POST /todos/:id/restore', async () => {
    mockRequest.post.mockResolvedValue(undefined)
    await todosApi.restore(7)
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/7/restore')
  })

  it('list() omits empty/undefined filters', async () => {
    mockRequest.get.mockResolvedValue([])
    await todosApi.list({ status: undefined, q: '', priority: undefined })
    expect(mockRequest.get).toHaveBeenCalledWith('/todos', { params: { page: 1, page_size: 50 } })
  })

  it('create(data) calls POST /todos', async () => {
    const todo = { id: 1, title: 'test' }
    mockRequest.post.mockResolvedValue(todo)
    const res = await todosApi.create({ title: 'test' })
    expect(mockRequest.post).toHaveBeenCalledWith('/todos', { title: 'test' })
    expect(res.data).toEqual(todo)
  })

  it('update(id, data) calls PUT /todos/:id', async () => {
    const todo = { id: 1, title: 'updated' }
    mockRequest.put.mockResolvedValue(todo)
    const res = await todosApi.update(1, { title: 'updated' })
    expect(mockRequest.put).toHaveBeenCalledWith('/todos/1', { title: 'updated' })
    expect(res.data).toEqual(todo)
  })

  it('toggleStatus(id) calls PATCH /todos/:id/toggle', async () => {
    const todo = { id: 1, status: 'done' }
    mockRequest.patch.mockResolvedValue(todo)
    const res = await todosApi.toggleStatus(1)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/1/toggle')
    expect(res.data).toEqual(todo)
  })

  it('reorder(id, afterId) calls PATCH /todos/:id/reorder', async () => {
    mockRequest.patch.mockResolvedValue(undefined)
    await todosApi.reorder(3, 2)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/3/reorder', { after_id: 2 })
  })

  it('togglePin(id) calls PATCH /todos/:id/pin', async () => {
    mockRequest.patch.mockResolvedValue({ id: 1, pinned: true })
    await todosApi.togglePin(1)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/1/pin')
  })

  it('reorder(id, null) sends after_id null (move to top)', async () => {
    mockRequest.patch.mockResolvedValue(undefined)
    await todosApi.reorder(3, null)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/3/reorder', { after_id: null })
  })

  it('syncToEvent(id) calls POST /todos/:id/sync-event', async () => {
    const event = { id: 1, title: 'test' }
    mockRequest.post.mockResolvedValue(event)
    const res = await todosApi.syncToEvent(1)
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/1/sync-event')
    expect(res.data).toEqual(event)
  })

  it('duplicate(id) calls POST /todos/:id/duplicate', async () => {
    const clone = { id: 9, title: 'x' }
    mockRequest.post.mockResolvedValue(clone)
    const res = await todosApi.duplicate(1)
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/1/duplicate')
    expect(res.data).toEqual(clone)
  })

  it('delete(id) calls DELETE /todos/:id', async () => {
    mockRequest.delete.mockResolvedValue(undefined)
    await todosApi.delete(1)
    expect(mockRequest.delete).toHaveBeenCalledWith('/todos/1')
  })

  it('bulk(ids, action) calls POST /todos/bulk', async () => {
    mockRequest.post.mockResolvedValue({ affected: 2 })
    await todosApi.bulk([1, 2], 'complete')
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/bulk', { ids: [1, 2], action: 'complete' })
  })

  it('listItems(todoId) calls GET /todos/:id/items', async () => {
    mockRequest.get.mockResolvedValue([])
    await todosApi.listItems(5)
    expect(mockRequest.get).toHaveBeenCalledWith('/todos/5/items', { signal: undefined })
  })

  it('createItem(todoId, content) calls POST /todos/:id/items', async () => {
    mockRequest.post.mockResolvedValue({ id: 1 })
    await todosApi.createItem(5, 'step')
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/5/items', { content: 'step' })
  })

  it('toggleItem(todoId, itemId) calls PATCH toggle', async () => {
    mockRequest.patch.mockResolvedValue({ id: 9, done: true })
    await todosApi.toggleItem(5, 9)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/5/items/9/toggle')
  })

  it('reorderItem(todoId, itemId, afterId) calls PATCH reorder', async () => {
    mockRequest.patch.mockResolvedValue(undefined)
    await todosApi.reorderItem(5, 9, 2)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/5/items/9/reorder', { after_id: 2 })
  })

  it('updateItem(todoId, itemId, data) calls PUT with content + due_time', async () => {
    mockRequest.put.mockResolvedValue({ id: 9, content: 'step' })
    await todosApi.updateItem(5, 9, { content: 'step', due_time: '2026-01-01T00:00:00.000Z' })
    expect(mockRequest.put).toHaveBeenCalledWith('/todos/5/items/9', { content: 'step', due_time: '2026-01-01T00:00:00.000Z' })
  })

  it('promoteItem(todoId, itemId) calls POST promote', async () => {
    mockRequest.post.mockResolvedValue({ id: 11, title: 'step' })
    await todosApi.promoteItem(5, 9)
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/5/items/9/promote')
  })

  it('deleteItem(todoId, itemId) calls DELETE /todos/:id/items/:itemId', async () => {
    mockRequest.delete.mockResolvedValue(undefined)
    await todosApi.deleteItem(5, 9)
    expect(mockRequest.delete).toHaveBeenCalledWith('/todos/5/items/9')
  })

  it('move(id, parentId, afterId) calls PATCH /todos/:id/move', async () => {
    mockRequest.patch.mockResolvedValue(undefined)
    await todosApi.move(3, 5, 2)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/3/move', { parent_id: 5, after_id: 2 })
  })

  it('move with null parent/after sends nulls (to root / top)', async () => {
    mockRequest.patch.mockResolvedValue(undefined)
    await todosApi.move(3, null, null)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/3/move', { parent_id: null, after_id: null })
  })

  it('list({parent_id}) forwards parent_id', async () => {
    mockRequest.get.mockResolvedValue([])
    await todosApi.list({ parent_id: 5 })
    expect(mockRequest.get).toHaveBeenCalledWith('/todos', { params: { page: 1, page_size: 50, parent_id: 5 } })
  })
})
