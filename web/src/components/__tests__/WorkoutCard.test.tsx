import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkoutCard } from '../WorkoutCard'
import type { Workout } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../hooks/api/useWorkouts', () => ({
  useToggleWorkout: () => ({ mutate: vi.fn() }),
  useDeleteWorkout: () => ({ mutateAsync: vi.fn() }),
}))

const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 1,
    user_id: 1,
    workspace_id: 1,
    name: '晨跑 5 公里',
    type: 'cardio',
    status: 'planned',
    intensity: '',
    scheduled_at: null,
    duration_min: 30,
    calories: 300,
    color: '',
    location: '',
    notes: '',
    sort_order: 0,
    completed_at: null,
    item_total: 2,
    item_done: 1,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function renderCard(overrides: Partial<Workout> = {}) {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <WorkoutCard workout={makeWorkout(overrides)} onEdit={vi.fn()} formatDate={() => 'Jan 1'} />
    </QueryClientProvider>,
  )
}

describe('WorkoutCard training diary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the training diary by default, without expanding the exercise list', () => {
    renderCard({ notes: '配速 6 分 24 秒，最后一公里提速。' })
    expect(screen.getByText('配速 6 分 24 秒，最后一公里提速。')).toBeInTheDocument()
    // The exercise checklist stays collapsed — the diary is the always-visible part.
    expect(screen.queryByText('fitness.exercises')).not.toBeInTheDocument()
  })

  it('renders multi-line diary entries with preserved line breaks', () => {
    renderCard({ notes: '第一行：热身充分。\n第二行：卧推降到 57.5kg，动作质量更好。' })
    const diary = screen.getByText(/第一行：热身充分。/)
    expect(diary).toHaveClass('whitespace-pre-wrap')
    expect(diary.textContent).toContain('\n')
  })

  it('renders nothing extra when the diary is empty or whitespace', () => {
    const { container } = renderCard({ notes: '   ' })
    expect(container.querySelector('.whitespace-pre-wrap')).toBeNull()
  })
})
