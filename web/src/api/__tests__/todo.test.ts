import { describe, it, expect, vi, beforeEach } from 'vitest'
import { todoApi } from '../todo'

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

describe('todoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('list() calls GET /todos with default pagination', async () => {
    mockRequest.get.mockResolvedValue([])
    await todoApi.list()
    expect(mockRequest.get).toHaveBeenCalledWith('/todos', { params: { status: undefined, page: 1, page_size: 50 } })
  })

  it('list(status) calls GET /todos with status and pagination', async () => {
    mockRequest.get.mockResolvedValue([])
    await todoApi.list('pending')
    expect(mockRequest.get).toHaveBeenCalledWith('/todos', { params: { status: 'pending', page: 1, page_size: 50 } })
  })

  it('create(data) calls POST /todos', async () => {
    const todo = { id: 1, title: 'test' }
    mockRequest.post.mockResolvedValue(todo)
    const res = await todoApi.create({ title: 'test' })
    expect(mockRequest.post).toHaveBeenCalledWith('/todos', { title: 'test' })
    expect(res.data).toEqual(todo)
  })

  it('update(id, data) calls PUT /todos/:id', async () => {
    const todo = { id: 1, title: 'updated' }
    mockRequest.put.mockResolvedValue(todo)
    const res = await todoApi.update(1, { title: 'updated' })
    expect(mockRequest.put).toHaveBeenCalledWith('/todos/1', { title: 'updated' })
    expect(res.data).toEqual(todo)
  })

  it('toggleStatus(id) calls PATCH /todos/:id/toggle', async () => {
    const todo = { id: 1, status: 'done' }
    mockRequest.patch.mockResolvedValue(todo)
    const res = await todoApi.toggleStatus(1)
    expect(mockRequest.patch).toHaveBeenCalledWith('/todos/1/toggle')
    expect(res.data).toEqual(todo)
  })

  it('syncToEvent(id) calls POST /todos/:id/sync-event', async () => {
    const event = { id: 1, title: 'test' }
    mockRequest.post.mockResolvedValue(event)
    const res = await todoApi.syncToEvent(1)
    expect(mockRequest.post).toHaveBeenCalledWith('/todos/1/sync-event')
    expect(res.data).toEqual(event)
  })

  it('delete(id) calls DELETE /todos/:id', async () => {
    mockRequest.delete.mockResolvedValue(undefined)
    await todoApi.delete(1)
    expect(mockRequest.delete).toHaveBeenCalledWith('/todos/1')
  })
})
