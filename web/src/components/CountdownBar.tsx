import { memo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Hourglass, X } from 'lucide-react'
import { useCountdownStore } from '../stores/countdown'
import { dueAlerts, formatCountdown, remainingSeconds, upcoming } from '../lib/countdown'
import { playBeep } from '../lib/beep'
import { cn } from '@/lib/utils'

const MAX_CHIPS = 3
const TICK_MS = 1000
/** Countdowns at or under this many seconds render urgent (rose + pulse). */
const URGENT_SECONDS = 5 * 60

/**
 * Global countdown strip, mounted once in AppLayout so it shows on every page.
 * Owns the only ticking clock — like PomodoroBar it is isolated, so the
 * per-second update never re-renders the layout or the active page. Alerts
 * (early heads-up + time's-up toast/beep/notification) fire from here even
 * while the bar is hidden; hiding only dismisses the display.
 */
export const CountdownBar = memo(function CountdownBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = useCountdownStore((s) => s.items)
  const barHidden = useCountdownStore((s) => s.barHidden)
  const markAlerted = useCountdownStore((s) => s.markAlerted)
  const setBarHidden = useCountdownStore((s) => s.setBarHidden)
  const [now, setNow] = useState(() => new Date())

  // Re-sync the clock whenever the set changes — a countdown added minutes
  // after mount must not display (or alert) against a stale `now`.
  useEffect(() => {
    setNow(new Date())
  }, [items])

  useEffect(() => {
    if (items.length === 0) return
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [items.length])

  // Fire due alerts exactly once each (the store flags them as fired).
  useEffect(() => {
    for (const a of dueAlerts(items, now)) {
      if (a.kind === 'final') {
        toast.message(t('countdown.doneTitle'), { description: a.label })
        playBeep(1040, 0.6)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(t('countdown.doneTitle'), { body: a.label })
        }
      } else {
        const left = formatCountdown(remainingSeconds(a.target, now), t)
        toast.message(t('countdown.preTitle'), { description: `${a.label} · ${left}` })
      }
      markAlerted(a.id, a.kind)
    }
  }, [now, items, markAlerted, t])

  const active = upcoming(items, now)
  if (barHidden || active.length === 0) return null

  const chips = active.slice(0, MAX_CHIPS)
  const overflow = active.length - chips.length

  return (
    <div className="mb-3 flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <Hourglass className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {chips.map((it) => {
        const sec = remainingSeconds(it.target, now)
        const urgent = sec <= URGENT_SECONDS
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => navigate('/countdowns')}
            className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 transition-colors hover:bg-muted"
            title={it.label}
          >
            <span className="max-w-[10rem] truncate">{it.label}</span>
            <span className={cn('font-semibold tabular-nums', urgent ? 'animate-pulse text-rose-500' : '')}>
              {formatCountdown(sec, t)}
            </span>
          </button>
        )
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => navigate('/countdowns')}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('countdown.more', { n: overflow })}
        </button>
      )}
      <button
        type="button"
        onClick={() => setBarHidden(true)}
        className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={t('countdown.hideBar')}
        title={t('countdown.hideBar')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
})
