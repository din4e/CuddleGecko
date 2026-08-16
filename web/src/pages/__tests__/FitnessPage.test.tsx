import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FitnessPage from '../FitnessPage'
import type { Workout, WorkoutStats, BodyMetricSummary, PaginatedData } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'fitness.title': '健身',
        'fitness.tabWorkouts': '训练计划',
        'fitness.tabBody': '身体记录',
        'fitness.newWorkout': '新建训练',
        'fitness.noWorkouts': '暂无训练计划',
        'fitness.noBodyRecords': '暂无身体记录',
        'fitness.newBodyRecord': '新建记录',
        'fitness.name': '名称',
        'fitness.allTypes': '全部类型',
        'fitness.allStatuses': '全部状态',
        'fitness.scheduledAt': '计划时间',
        'fitness.recordedAt': '记录时间',
        'fitness.statsCompleted': '累计完成',
        'fitness.statsThisWeek': '本周完成',
        'fitness.statsMinutes': '累计时长',
        'fitness.statsCalories': '消耗卡路里',
        'fitness.completionRate': '完成率',
        'fitness.minutesShort': '分钟',
        'fitness.latestWeight': '最新体重',
        'fitness.bmi': 'BMI',
        'fitness.bodyFat': '体脂率',
        'fitness.totalRecords': '记录数',
        'fitness.weightTrend': '体重趋势',
        'fitness.typeCardio': '有氧',
        'fitness.statusPlanned': '已计划',
        'fitness.weight': '体重',
        'common.cancel': '取消',
        'common.create': '创建',
      }
      return translations[key] || key
    },
    i18n: { language: 'zh' },
  }),
  // The page under test imports i18n (via lib/toast), which calls
  // i18n.use(initReactI18next) — the mock must provide it.
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../../api/workouts', () => ({
  workoutsApi: {
    list: vi.fn(),
    stats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toggle: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(),
    listExercises: vi.fn(),
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    toggleExercise: vi.fn(),
    deleteExercise: vi.fn(),
  },
}))

vi.mock('../../api/bodyMetrics', () => ({
  bodyMetricsApi: {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { workoutsApi } from '../../api/workouts'
import { bodyMetricsApi } from '../../api/bodyMetrics'

const sampleWorkout: Workout = {
  id: 1, user_id: 1, workspace_id: 1, name: '晨跑 5 公里', type: 'cardio',
  status: 'planned', intensity: '', scheduled_at: null, duration_min: 30,
  calories: 300, color: '', location: '', notes: '', sort_order: 0,
  completed_at: null, item_total: 0, item_done: 0, created_at: '', updated_at: '',
}

const sampleStats: WorkoutStats = {
  total: 1, planned: 1, in_progress: 0, completed: 0, skipped: 0,
  this_week: 0, total_minutes: 30, total_calories: 300,
}

const emptySummary: BodyMetricSummary = {
  latest: null, latest_weight: null, prev_weight: null,
  weight_trend: 'none', count: 0, first_at: null, last_at: null,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <FitnessPage />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('FitnessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.mocked(workoutsApi.list).mockResolvedValue({ data: { items: [sampleWorkout], total: 1, page: 1, page_size: 100 } as PaginatedData<Workout> })
    vi.mocked(workoutsApi.stats).mockResolvedValue({ data: sampleStats })
    vi.mocked(bodyMetricsApi.list).mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 100 } })
    vi.mocked(bodyMetricsApi.summary).mockResolvedValue({ data: emptySummary })
  })

  it('renders the title and the seeded workout on the workouts tab', async () => {
    renderPage()
    expect(screen.getByText('健身')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('晨跑 5 公里')).toBeInTheDocument())
  })

  it('switches to the body records tab and shows the empty state', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('晨跑 5 公里')).toBeInTheDocument())

    await user.click(screen.getByText('身体记录'))
    await waitFor(() => expect(screen.getByText('暂无身体记录')).toBeInTheDocument())
  })
})
