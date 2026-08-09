import { describe, it, expect, vi, beforeEach } from 'vitest'
import { workoutsApi } from '../workouts'

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

describe('workoutsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('list() calls GET /workouts with default pagination', async () => {
    mockRequest.get.mockResolvedValue([])
    await workoutsApi.list()
    expect(mockRequest.get).toHaveBeenCalledWith('/workouts', { params: { page: 1, page_size: 50 }, signal: undefined })
  })

  it('list(params) calls GET /workouts with filters', async () => {
    mockRequest.get.mockResolvedValue([])
    await workoutsApi.list({ status: 'planned', type: 'cardio', q: 'run' })
    expect(mockRequest.get).toHaveBeenCalledWith('/workouts', { params: { page: 1, page_size: 50, status: 'planned', type: 'cardio', q: 'run' }, signal: undefined })
  })

  it('stats() calls GET /workouts/stats', async () => {
    mockRequest.get.mockResolvedValue({ total: 1 })
    await workoutsApi.stats()
    expect(mockRequest.get).toHaveBeenCalledWith('/workouts/stats')
  })

  it('create(data) calls POST /workouts', async () => {
    const w = { id: 1, name: 'push' }
    mockRequest.post.mockResolvedValue(w)
    const res = await workoutsApi.create({ name: 'push' })
    expect(mockRequest.post).toHaveBeenCalledWith('/workouts', { name: 'push' })
    expect(res.data).toEqual(w)
  })

  it('update(id, data) calls PUT /workouts/:id', async () => {
    const w = { id: 1, name: 'updated' }
    mockRequest.put.mockResolvedValue(w)
    const res = await workoutsApi.update(1, { name: 'updated', clear_calories: true })
    expect(mockRequest.put).toHaveBeenCalledWith('/workouts/1', { name: 'updated', clear_calories: true })
    expect(res.data).toEqual(w)
  })

  it('toggle(id) calls PATCH /workouts/:id/toggle', async () => {
    mockRequest.patch.mockResolvedValue({ id: 1, status: 'completed' })
    await workoutsApi.toggle(1)
    expect(mockRequest.patch).toHaveBeenCalledWith('/workouts/1/toggle')
  })

  it('reorder(id, afterId) calls PATCH /workouts/:id/reorder', async () => {
    mockRequest.patch.mockResolvedValue(undefined)
    await workoutsApi.reorder(3, 2)
    expect(mockRequest.patch).toHaveBeenCalledWith('/workouts/3/reorder', { after_id: 2 })
  })

  it('delete(id) calls DELETE /workouts/:id', async () => {
    mockRequest.delete.mockResolvedValue(undefined)
    await workoutsApi.delete(1)
    expect(mockRequest.delete).toHaveBeenCalledWith('/workouts/1')
  })

  it('listExercises(workoutId) calls GET /workouts/:id/exercises', async () => {
    mockRequest.get.mockResolvedValue([])
    await workoutsApi.listExercises(5)
    expect(mockRequest.get).toHaveBeenCalledWith('/workouts/5/exercises', { signal: undefined })
  })

  it('createExercise(workoutId, data) calls POST /workouts/:id/exercises', async () => {
    mockRequest.post.mockResolvedValue({ id: 1 })
    await workoutsApi.createExercise(5, { name: 'squat' })
    expect(mockRequest.post).toHaveBeenCalledWith('/workouts/5/exercises', { name: 'squat' })
  })

  it('toggleExercise(workoutId, exerciseId) calls PATCH toggle', async () => {
    mockRequest.patch.mockResolvedValue({ id: 9, done: true })
    await workoutsApi.toggleExercise(5, 9)
    expect(mockRequest.patch).toHaveBeenCalledWith('/workouts/5/exercises/9/toggle')
  })

  it('deleteExercise(workoutId, exerciseId) calls DELETE', async () => {
    mockRequest.delete.mockResolvedValue(undefined)
    await workoutsApi.deleteExercise(5, 9)
    expect(mockRequest.delete).toHaveBeenCalledWith('/workouts/5/exercises/9')
  })

  it('list() omits empty/undefined filters', async () => {
    mockRequest.get.mockResolvedValue([])
    await workoutsApi.list({ status: undefined, q: '', type: undefined })
    expect(mockRequest.get).toHaveBeenCalledWith('/workouts', { params: { page: 1, page_size: 50 }, signal: undefined })
  })
})
