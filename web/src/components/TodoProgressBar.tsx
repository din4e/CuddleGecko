/** Ultra-thin progress bar shown wherever a todo row/card renders: a 3px
 *  muted track with an emerald fill proportional to the percent. No numeric
 *  label — the fill length IS the value (aria-label carries the number). */
export default function TodoProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <span
      role="img"
      aria-label={`${pct}%`}
      className={`inline-block h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-muted ${className}`}
    >
      <span className="block h-full rounded-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
    </span>
  )
}
