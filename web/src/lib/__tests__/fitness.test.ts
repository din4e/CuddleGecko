import { describe, it, expect } from 'vitest'
import {
  toBodyChartData,
  dateAfterForRange,
  bucketLabel,
  toHistoryChartData,
  prFor,
  epley1rm,
  goalPercent,
  trendDomain,
  localDayKey,
  workoutDayKey,
  metricByDay,
  workoutsByDay,
} from '../fitness'
import type { BodyMetric, FitnessGoal, Workout, WorkoutPR } from '../../types'

function metric(partial: Partial<BodyMetric>): BodyMetric {
  return {
    id: 0,
    user_id: 0,
    workspace_id: 0,
    recorded_at: '2026-08-01T00:00:00Z',
    weight: null,
    height: null,
    body_fat: null,
    muscle_mass: null,
    resting_hr: null,
    systolic: null,
    diastolic: null,
    sleep_hours: null,
    bedtime: null, wake_time: null, sleep_score: null,
    steps: null,
    energy: null,
    mood: null,
    notes: '',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

/** ISO string for a local-canvas date/time, so day-key tests don't depend on
 *  the machine's timezone (components → ISO → localDayKey round-trips to the
 *  same calendar day for any offset within ±14h). */
function localIso(y: number, mo: number, d: number, h = 9, mi = 30): string {
  return new Date(y, mo - 1, d, h, mi).toISOString()
}

describe('toBodyChartData', () => {
  it('reverses newest-first records and maps the selected metric', () => {
    const rows = [
      metric({ recorded_at: localIso(2026, 8, 2), weight: 71 }),
      metric({ recorded_at: localIso(2026, 8, 1), weight: 70 }),
    ]
    expect(toBodyChartData(rows, 'weight')).toEqual([
      { date: '8/1', day: '2026-08-01', a: 70 },
      { date: '8/2', day: '2026-08-02', a: 71 },
    ])
  })

  it('bp maps systolic/diastolic into a/b', () => {
    const rows = [metric({ recorded_at: localIso(2026, 8, 1), systolic: 120, diastolic: 80 })]
    expect(toBodyChartData(rows, 'bp')).toEqual([{ date: '8/1', day: '2026-08-01', a: 120, b: 80 }])
  })

  it('drops records without a value for the metric', () => {
    const rows = [metric({ weight: 70 }), metric({ steps: 1000 })]
    expect(toBodyChartData(rows, 'steps')).toHaveLength(1)
    expect(toBodyChartData(rows, 'steps')[0].a).toBe(1000)
  })

  it('attaches same-day workout names as trained markers', () => {
    const rows = [
      metric({ recorded_at: localIso(2026, 8, 2), weight: 71 }),
      metric({ recorded_at: localIso(2026, 8, 1), weight: 70 }),
    ]
    const trained = new Map([['2026-08-01', ['Morning Run', 'Yoga']]])
    const points = toBodyChartData(rows, 'weight', trained)
    expect(points[0].trained).toEqual(['Morning Run', 'Yoga'])
    expect(points[1].trained).toBeUndefined()
  })
})

describe('localDayKey', () => {
  it('keys by the local calendar day', () => {
    expect(localDayKey(localIso(2026, 8, 1, 23, 45))).toBe('2026-08-01')
  })
  it('returns null for absent or invalid timestamps', () => {
    expect(localDayKey(null)).toBeNull()
    expect(localDayKey(undefined)).toBeNull()
    expect(localDayKey('')).toBeNull()
    expect(localDayKey('not-a-date')).toBeNull()
  })
})

describe('workoutDayKey', () => {
  it('prefers scheduled_at, then completed_at, then created_at', () => {
    const base = { scheduled_at: null, completed_at: null, created_at: localIso(2026, 1, 1) }
    expect(workoutDayKey({ ...base, scheduled_at: localIso(2026, 8, 1) })).toBe('2026-08-01')
    expect(workoutDayKey({ ...base, completed_at: localIso(2026, 8, 2) })).toBe('2026-08-02')
    expect(workoutDayKey(base)).toBe('2026-01-01')
    expect(workoutDayKey({ scheduled_at: null, completed_at: null, created_at: '' })).toBeNull()
  })
})

describe('metricByDay', () => {
  it('keeps the newest record per day from newest-first input', () => {
    const rows = [
      metric({ id: 2, recorded_at: localIso(2026, 8, 1, 20), weight: 70.5 }),
      metric({ id: 1, recorded_at: localIso(2026, 8, 1, 8), weight: 70 }),
      metric({ id: 0, recorded_at: localIso(2026, 7, 31, 9), weight: 69 }),
    ]
    const map = metricByDay(rows)
    expect(map.size).toBe(2)
    expect(map.get('2026-08-01')?.id).toBe(2)
    expect(map.get('2026-07-31')?.id).toBe(0)
  })
})

describe('workoutsByDay', () => {
  const workout = (id: number, scheduled_at: string | null, completed_at: string | null = null): Pick<Workout, 'scheduled_at' | 'completed_at' | 'created_at'> & { id: number } =>
    ({ id, scheduled_at, completed_at, created_at: localIso(2020, 1, 1) })

  it('groups by day and preserves order within a day', () => {
    const map = workoutsByDay([
      workout(1, localIso(2026, 8, 1, 7)),
      workout(2, localIso(2026, 8, 1, 19)),
      workout(3, localIso(2026, 8, 3, 7)),
    ] as Workout[])
    expect(map.size).toBe(2)
    expect(map.get('2026-08-01')?.map((w) => w.id)).toEqual([1, 2])
    expect(map.get('2026-08-03')?.map((w) => w.id)).toEqual([3])
  })

  it('falls back to completed_at when scheduled_at is null', () => {
    const map = workoutsByDay([workout(9, null, localIso(2026, 8, 5, 21))] as Workout[])
    expect(map.get('2026-08-05')?.map((w) => w.id)).toEqual([9])
  })
})

describe('dateAfterForRange', () => {
  it('returns undefined for all', () => {
    expect(dateAfterForRange('all')).toBeUndefined()
  })
  it('returns an ISO string ~30 days back for 30d', () => {
    const got = dateAfterForRange('30d')!
    const days = (Date.now() - new Date(got).getTime()) / 86400000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})

describe('bucketLabel', () => {
  it('shortens week and month buckets', () => {
    expect(bucketLabel('2026-W33')).toBe('W33')
    expect(bucketLabel('2026-08')).toBe('8')
  })
})

describe('toHistoryChartData', () => {
  it('maps and rounds calories', () => {
    expect(
      toHistoryChartData([{ bucket: '2026-W33', count: 2, minutes: 90, calories: 400.6 }]),
    ).toEqual([{ label: 'W33', count: 2, minutes: 90, calories: 401 }])
  })
})

describe('prFor', () => {
  const prs: WorkoutPR[] = [
    { exercise: 'Bench Press', best_weight: 100, best_e1rm: 120, best_set_at: '2026-08-01T00:00:00Z' },
  ]
  it('matches case-insensitively', () => {
    expect(prFor(prs, 'bench press ')?.best_weight).toBe(100)
  })
  it('returns undefined for unknown exercise', () => {
    expect(prFor(prs, 'squat')).toBeUndefined()
  })
})

describe('epley1rm', () => {
  it('computes Epley estimate', () => {
    expect(epley1rm(100, 6)).toBeCloseTo(120)
  })
  it('returns 0 for non-positive input', () => {
    expect(epley1rm(0, 5)).toBe(0)
    expect(epley1rm(100, 0)).toBe(0)
  })
})

describe('goalPercent', () => {
  const goal = (target: number, current: number): FitnessGoal => ({
    id: 1,
    type: 'weekly_workouts',
    target_value: target,
    deadline: null,
    status: 'active',
    current_value: current,
    created_at: '',
    updated_at: '',
  })
  it('computes and clamps percent', () => {
    expect(goalPercent(goal(4, 2))).toBe(50)
    expect(goalPercent(goal(4, 9))).toBe(100)
    expect(goalPercent(goal(4, -1))).toBe(0)
  })
  it('returns 0 for non-positive target', () => {
    expect(goalPercent(goal(0, 3))).toBe(0)
  })
})

describe('trendDomain', () => {
  it('pads a varying series so the trend fills the axis instead of hugging zero', () => {
    // 68–72kg weight: a zero-based axis would flatten this to a near-line.
    const [lo, hi] = trendDomain([68, 70, 69, 72, 71])!
    expect(lo).toBeCloseTo(67.5)
    expect(hi).toBeCloseTo(72.5)
    expect(lo).toBeGreaterThan(0)
  })
  it('pads a flat series around its value', () => {
    expect(trendDomain([70, 70])).toEqual([66.5, 73.5])
    expect(trendDomain([3])).toEqual([2, 4])
  })
  it('covers both series for dual-line metrics (bp)', () => {
    const [lo, hi] = trendDomain([120, 118, undefined, 80, 79])!
    expect(lo).toBeCloseTo(74)
    expect(hi).toBeCloseTo(125)
  })
  it('quantizes bounds outward to 0.1 so ticks stay readable', () => {
    expect(trendDomain([70.9, 72.5])).toEqual([70.7, 72.7])
  })
  it('returns undefined without finite values', () => {
    expect(trendDomain([])).toBeUndefined()
    expect(trendDomain([null, undefined])).toBeUndefined()
  })
})
