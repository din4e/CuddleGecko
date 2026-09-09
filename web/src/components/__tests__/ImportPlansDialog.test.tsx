import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPlansDialog } from '../ImportPlansDialog'
import type { Todo, Event, Habit } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // interpolate {count} so the import button text reflects the selection
    t: (k: string, opts?: { count?: number }) =>
      opts && opts.count != null ? `${k}:${opts.count}` : k,
    i18n: { language: 'zh' },
  }),
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useTodosList: vi.fn(),
}))
vi.mock('../../hooks/api/useEvents', () => ({
  useEventsList: vi.fn(),
}))
vi.mock('../../hooks/api/useHabits', () => ({
  useHabitsList: vi.fn(),
}))
vi.mock('../../hooks/api/useWorkouts', () => ({
  useCreateWorkout: vi.fn(),
}))

import { useTodosList } from '../../hooks/api/useTodos'
import { useEventsList } from '../../hooks/api/useEvents'
import { useHabitsList } from '../../hooks/api/useHabits'
import { useCreateWorkout } from '../../hooks/api/useWorkouts'

const todo: Todo = {
  id: 1, user_id: 1, workspace_id: 1, title: '周三夜跑 5 公里', description: '',
  status: 'pending', priority: 'normal', due_time: '2026-09-10T19:00:00Z',
  amount: null, amount_type: '', contact_ids: [], color: '',
  completed_at: null, created_at: '', updated_at: '',
}

const event: Event = {
  id: 2, user_id: 1, title: '羽毛球局', description: '',
  start_time: '2026-09-11T20:00:00Z', end_time: null, location: '体育馆',
  contact_ids: [], color: '', created_at: '', updated_at: '',
}

const habit: Habit = {
  id: 3, user_id: 1, workspace_id: 1, name: '每日俯卧撑', color: '', emoji: '💪',
  frequency: 'daily', archived: false, sort_order: 0,
  created_at: '', updated_at: '',
  today_done: false, streak: 4, best: 10, rate_30: 0.8, recent: [],
}

const mutateAsync = vi.fn().mockResolvedValue({})

function renderDialog() {
  return render(<ImportPlansDialog open onClose={vi.fn()} />)
}

describe('ImportPlansDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTodosList).mockReturnValue({ data: { items: [todo], total: 1, page: 1, page_size: 100 } } as never)
    vi.mocked(useEventsList).mockReturnValue({ data: { items: [event], total: 1, page: 1, page_size: 100 } } as never)
    vi.mocked(useHabitsList).mockReturnValue({ data: [habit] } as never)
    vi.mocked(useCreateWorkout).mockReturnValue({ mutateAsync, isPending: false } as never)
  })

  it('lists importable items from todos, events and habits with source badges', async () => {
    renderDialog()
    expect(await screen.findByText('周三夜跑 5 公里')).toBeInTheDocument()
    expect(screen.getByText('羽毛球局')).toBeInTheDocument()
    expect(screen.getByText('每日俯卧撑')).toBeInTheDocument()
    expect(screen.getByText('fitness.importSourceTodo')).toBeInTheDocument()
    expect(screen.getByText('fitness.importSourceEvent')).toBeInTheDocument()
    expect(screen.getByText('fitness.importSourceHabit')).toBeInTheDocument()
  })

  it('imports selected items as planned workouts carrying their schedule', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ImportPlansDialog open onClose={onClose} />)
    await screen.findByText('周三夜跑 5 公里')

    await user.click(screen.getByLabelText('周三夜跑 5 公里'))
    await user.click(screen.getByLabelText('每日俯卧撑'))
    expect(screen.getByText('fitness.importSelected:2')).toBeInTheDocument()

    await user.click(screen.getByText('fitness.importSelected:2'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledTimes(2)
    expect(mutateAsync).toHaveBeenCalledWith({
      name: '周三夜跑 5 公里', type: 'other', status: 'planned',
      scheduled_at: '2026-09-10T19:00:00Z',
    })
    expect(mutateAsync).toHaveBeenCalledWith({
      name: '每日俯卧撑', type: 'other', status: 'planned', scheduled_at: undefined,
    })
  })

  it('filters the list by search', async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByText('周三夜跑 5 公里')
    await user.type(screen.getByPlaceholderText('fitness.importSearchPlaceholder'), '羽毛')
    expect(screen.getByText('羽毛球局')).toBeInTheDocument()
    expect(screen.queryByText('周三夜跑 5 公里')).not.toBeInTheDocument()
  })
})
