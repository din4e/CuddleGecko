// Pure mappers/utilities for the Fitness module (no React, no i18n) — unit-tested
// in lib/__tests__/fitness.test.ts.
import type { BodyMetric, FitnessGoal, Workout, WorkoutPR } from '../types'

/** Selectable chart metrics on the Body tab; 'bp' renders two lines. */
export type BodyChartMetric =
  | 'weight'
  | 'body_fat'
  | 'muscle_mass'
  | 'bp'
  | 'resting_hr'
  | 'sleep_hours'
  | 'steps'
  | 'energy'
  | 'mood'

export const BODY_CHART_METRICS: BodyChartMetric[] = [
  'weight',
  'body_fat',
  'muscle_mass',
  'bp',
  'resting_hr',
  'sleep_hours',
  'steps',
  'energy',
  'mood',
]

function hasAny(m: BodyMetric, metric: BodyChartMetric): boolean {
  if (metric === 'bp') return m.systolic != null || m.diastolic != null
  return m[metric] != null
}

// --- Same-day workout ↔ body-record correlation (local calendar days) ---
// Workouts and body metrics have no foreign key; the day key joins them.

/** Local calendar day "2026-08-14" of an ISO timestamp; null when absent/invalid. */
export function localDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A workout's day: scheduled date first, else completion, else creation. */
export function workoutDayKey(w: Pick<Workout, 'scheduled_at' | 'completed_at' | 'created_at'>): string | null {
  return localDayKey(w.scheduled_at) ?? localDayKey(w.completed_at) ?? localDayKey(w.created_at)
}

/** Newest body record per local day. Input is the API's newest-first list, so
 *  the first record seen for a day wins; later duplicates are ignored. */
export function metricByDay(metrics: BodyMetric[]): Map<string, BodyMetric> {
  const map = new Map<string, BodyMetric>()
  for (const m of metrics) {
    const day = localDayKey(m.recorded_at)
    if (day && !map.has(day)) map.set(day, m)
  }
  return map
}

/** Workouts grouped by their local day, preserving the input order. */
export function workoutsByDay(workouts: Workout[]): Map<string, Workout[]> {
  const map = new Map<string, Workout[]>()
  for (const w of workouts) {
    const day = workoutDayKey(w)
    if (!day) continue
    const list = map.get(day)
    if (list) list.push(w)
    else map.set(day, [w])
  }
  return map
}

export interface BodyChartPoint {
  date: string
  /** local day key — joins the point to same-day workouts */
  day: string
  /** primary series value (or systolic for bp) */
  a: number | null
  /** secondary series value (diastolic for bp, else absent) */
  b?: number | null
  /** same-day workout names, rendered as training-day markers */
  trained?: string[]
}

/**
 * Map newest-first body metric records into chronological chart points for the
 * selected metric. Records without a value for the metric are dropped so
 * connectNulls-style gaps don't appear. When trainedDays (day key → workout
 * names) is given, points carry the same-day names for chart markers.
 */
export function toBodyChartData(metrics: BodyMetric[], metric: BodyChartMetric, trainedDays?: Map<string, string[]>): BodyChartPoint[] {
  return [...metrics]
    .filter((m) => hasAny(m, metric))
    .reverse()
    .map((m) => {
      const d = new Date(m.recorded_at)
      const date = `${d.getMonth() + 1}/${d.getDate()}`
      const day = localDayKey(m.recorded_at) ?? ''
      const trained = day ? trainedDays?.get(day) : undefined
      const trainedProp = trained?.length ? { trained } : {}
      if (metric === 'bp') return { date, day, a: m.systolic, b: m.diastolic, ...trainedProp }
      return { date, day, a: m[metric], ...trainedProp }
    })
}

/**
 * Y-axis domain [lo, hi] for a trend chart: data min/max padded by 12% of the
 * range, so real variation isn't crushed against a zero-based axis (a 68–72kg
 * weight series on a 0–72 axis renders as an almost-flat line). Flat data pads
 * by max(5% of |value|, 1) so a single value still sits mid-chart. Bounds are
 * quantized outward to 0.1 so axis ticks stay readable (no 70.70800…0001).
 * Returns undefined when there is no finite value (caller keeps the axis
 * default).
 */
export function trendDomain(values: Array<number | null | undefined>): [number, number] | undefined {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length === 0) return undefined
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const pad = min === max ? Math.max(Math.abs(min) * 0.05, 1) : (max - min) * 0.12
  return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10]
}

/** Range selector value → date_after ISO string (undefined = all time). */
export function dateAfterForRange(range: '30d' | '90d' | '1y' | 'all'): string | undefined {
  if (range === 'all') return undefined
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** "2026-W33" → "W33"; "2026-08" → "Aug"-style numeric label "2026.8"→"8". */
export function bucketLabel(bucket: string): string {
  if (bucket.includes('W')) return `W${bucket.split('W')[1]}`
  const month = bucket.slice(5)
  return String(Number(month))
}

export interface HistoryChartPoint {
  label: string
  count: number
  minutes: number
  calories: number
}

/** Server history (ascending) → chart points; data is already ascending. */
export function toHistoryChartData(buckets: { bucket: string; count: number; minutes: number; calories: number }[]): HistoryChartPoint[] {
  return buckets.map((b) => ({ label: bucketLabel(b.bucket), count: b.count, minutes: b.minutes, calories: Math.round(b.calories) }))
}

/** Find the PR entry for an exercise by name (case-insensitive). */
export function prFor(prs: WorkoutPR[], exerciseName: string): WorkoutPR | undefined {
  const needle = exerciseName.trim().toLowerCase()
  return prs.find((p) => p.exercise.trim().toLowerCase() === needle)
}

/** Estimated 1RM (Epley) shown next to PR weight. */
export function epley1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  return weight * (1 + reps / 30)
}

/** Goal completion percent, clamped to 0–100; non-positive targets yield 0. */
export function goalPercent(goal: FitnessGoal): number {
  if (goal.target_value <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((goal.current_value / goal.target_value) * 100)))
}
