import { Skeleton } from './ui/skeleton'

// ListSkeleton is a generic loading placeholder for list/table pages, replacing
// bare "Loading…" text and the EmptyState-misused-as-loading antipattern (which
// flashes "no data" while still loading).
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border p-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// StatGridSkeleton mirrors the dashboard's stat-card grid (small label row +
// big number per card) so the placeholder matches the real layout.
export function StatGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-7 w-1/2" />
        </div>
      ))}
    </div>
  )
}
