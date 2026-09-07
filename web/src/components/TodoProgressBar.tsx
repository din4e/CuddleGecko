/** Mini progress bar + percent label, shown wherever a todo row/card renders. */
export default function TodoProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`} aria-label={`${pct}%`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </span>
  )
}
