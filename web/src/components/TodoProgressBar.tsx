/** Mini progress bar + percent label, shown wherever a todo row/card renders.
 *  Thin outlined pill: 1px tinted border, interior fill proportional to the
 *  percent (border-box h-1 → 4px total). */
export default function TodoProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`} aria-label={`${pct}%`}>
      <span className="inline-flex h-1 w-10 shrink-0 overflow-hidden rounded-full border border-emerald-600/60 dark:border-emerald-400/60">
        <span className="h-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </span>
  )
}
