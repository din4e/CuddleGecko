import { useState } from 'react'

interface StarRatingProps {
  value: number | null
  onChange?: (v: number | null) => void
  /** Scale upper bound; body-metric energy/mood use a 10-point scale. */
  max?: number
  readOnly?: boolean
}

/**
 * 🌟 rating picker on a 10-point scale. Click a star to set the score; click
 * the same star again to clear it (the underlying fields are nullable). Hover
 * previews the score before committing.
 */
export function StarRating({ value, onChange, max = 10, readOnly = false }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value ?? 0}/${max}`}>
        {value != null && <span className="text-xs text-muted-foreground">{value}/{max}</span>}
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`text-xs leading-none ${i < shown ? '' : 'opacity-20 grayscale'}`}>🌟</span>
        ))}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" onMouseLeave={() => setHover(null)}>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}/${max}`}
            className={`text-sm leading-none transition-transform hover:scale-125 ${n <= shown ? '' : 'opacity-25 grayscale'}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange?.(n === value ? null : n)}
          >
            🌟
          </button>
        )
      })}
      {value != null && <span className="ml-1 shrink-0 text-xs text-muted-foreground">{value}/{max}</span>}
    </div>
  )
}
