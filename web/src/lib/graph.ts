// Temporal coloring for the relationship graph: maps a node's last-interaction time to a
// recency gradient (recent → vivid green, old → faded gray), giving the graph a time dimension.
// NOW_MS is captured once per session (module load); the day-buckets are coarse enough that
// within-session drift is irrelevant, and keeping it module-scoped avoids impure Date.now()
// calls inside React render/hook bodies.

const NOW_MS = Date.now()
const DAY_MS = 24 * 60 * 60 * 1000

export function getRecencyColor(lastInteractionAt?: string): string {
  if (!lastInteractionAt) return '#9ca3af' // gray — no interaction recorded
  const t = new Date(lastInteractionAt).getTime()
  if (Number.isNaN(t)) return '#9ca3af'
  const days = (NOW_MS - t) / DAY_MS
  if (days <= 7) return '#10b981' // emerald — this week
  if (days <= 30) return '#22c55e' // green — this month
  if (days <= 90) return '#f59e0b' // amber — this quarter
  if (days <= 365) return '#f97316' // orange — this year
  return '#9ca3af' // gray — over a year ago
}

// Legend stops for the recency gradient (newest → oldest), keyed to i18n labels.
export const RECENCY_STOPS: { color: string; label: string }[] = [
  { color: '#10b981', label: 'graph.recency7' },
  { color: '#22c55e', label: 'graph.recency30' },
  { color: '#f59e0b', label: 'graph.recency90' },
  { color: '#f97316', label: 'graph.recency365' },
  { color: '#9ca3af', label: 'graph.recencyOld' },
]
