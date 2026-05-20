import { describe, it, expect, vi, beforeEach } from 'vitest'
import { todoApi } from '../todo'

vi.mock('../client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import client from '../client'

const mockClient = vi.mocked(client)

describe('todoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('list() calls GET /todos without params', async () => {
    mockClient.get.mockResolvedValue({ data: [] })
    await todoApi.list()
    expect(mockClient.get).toHaveBeenCalledWith('/todos', { params: {} })
  })

  it('list(status) calls GET /todos with status param', async () => {
    mockClient.get.mockResolvedValue({ data: [] })
    await todoApi.list('pending')
    expect(mockClient.get).toHaveBeenCalledWith('/todos', { params: { status: 'pending' } })
  })

  it('create(data) calls POST /todos', async () => {
    const todo = { id: 1, title: 'test' }
    mockClient.post.mockResolvedValue({ data: todo })
    const res = await todoApi.create({ title: 'test' })
    expect(mockClient.post).toHaveBeenCalledWith('/todos', { title: 'test' })
    expect(res.data).toEqual(todo)
  })

  it('update(id, data) calls PUT /todos/:id', async () => {
    const todo = { id: 1, title: 'updated' }
    mockClient.put.mockResolvedValue({ data: todo })
    const res = await todoApi.update(1, { title: 'updated' })
    expect(mockClient.put).toHaveBeenCalledWith('/todos/1', { title: 'updated' })
    expect(res.data).toEqual(todo)
  })

  it('toggleStatus(id) calls PATCH /todos/:id/toggle', async () => {
    const todo = { id: 1, status: 'done' }
    mockClient.patch.mockResolvedValue({ data: todo })
    const res = await todoApi.toggleStatus(1)
    expect(mockClient.patch).toHaveBeenCalledWith('/todos/1/toggle')
    expect(res.data).toEqual(todo)
  })

  it('syncToEvent(id) calls POST /todos/:id/sync-event', async () => {
    const event = { id: 1, title: 'test' }
    mockClient.post.mockResolvedValue({ data: event })
    const res = await todoApi.syncToEvent(1)
    expect(mockClient.post).toHaveBeenCalledWith('/todos/1/sync-event')
    expect(res.data).toEqual(event)
  })

  it('delete(id) calls DELETE /todos/:id', async () => {
    mockClient.delete.mockResolvedValue({ data: null })
    await todoApi.delete(1)
    expect(mockClient.delete).toHaveBeenCalledWith('/todos/1')
  })
})
