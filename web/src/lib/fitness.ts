// Pure mappers/utilities for the Fitness module (no React, no i18n) — unit-tested
// in lib/__tests__/fitness.test.ts.
import type { BodyMetric, FitnessGoal, WorkoutPR } from '../types'

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

export interface BodyChartPoint {
  date: string
  /** primary series value (or systolic for bp) */
  a: number | null
  /** secondary series value (diastolic for bp, else absent) */
  b?: number | null
}

/**
 * Map newest-first body metric records into chronological chart points for the
 * selected metric. Records without a value for the metric are dropped so
 * connectNulls-style gaps don't appear.
 */
export function toBodyChartData(metrics: BodyMetric[], metric: BodyChartMetric): BodyChartPoint[] {
  return [...metrics]
    .filter((m) => hasAny(m, metric))
    .reverse()
    .map((m) => {
      const d = new Date(m.recorded_at)
      const date = `${d.getMonth() + 1}/${d.getDate()}`
      if (metric === 'bp') return { date, a: m.systolic, b: m.diastolic }
      return { date, a: m[metric] }
    })
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
