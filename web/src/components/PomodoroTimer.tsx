import { useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw, SkipForward, Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PomodoroPhase } from '../stores/pomodoro'
import { formatPomodoroTime } from '../stores/pomodoro'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const phaseColor: Record<PomodoroPhase, string> = {
  idle: 'text-muted-foreground',
  work: 'text-rose-500',
  break: 'text-emerald-500',
}

export interface PomodoroTimerProps {
  phase: PomodoroPhase
  secondsLeft: number
  running: boolean
  focusTodoTitle: string | null
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onSkip: () => void
}

export function PomodoroTimer({ phase, secondsLeft, running, focusTodoTitle, onStart, onPause, onReset, onSkip }: PomodoroTimerProps) {
  const { t } = useTranslation()
  const phaseLabel = phase === 'break' ? t('todos.pomoBreak') : t('todos.pomoFocus')

  // Beep + notification when a focus session ends (work → break).
  const prevPhase = useRef(phase)
  useEffect(() => {
    if (phase === 'break' && prevPhase.current === 'work') {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
        osc.start()
        osc.stop(ctx.currentTime + 0.5)
      } catch {
        // AudioContext unavailable — ignore.
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(t('todos.pomoDone'), { body: focusTodoTitle ?? '' })
      }
    }
    prevPhase.current = phase
  }, [phase, t, focusTodoTitle])

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <Timer className={cn('h-5 w-5 shrink-0', phaseColor[phase])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-xl font-bold tabular-nums', phaseColor[phase])}>
            {formatPomodoroTime(secondsLeft)}
          </span>
          <span className="text-xs text-muted-foreground">{phaseLabel}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {focusTodoTitle ?? t('todos.pomoNoFocus')}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {running ? (
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPause} aria-label={t('todos.pomoPause')}>
            <Pause className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onStart} aria-label={t('todos.pomoStart')}>
            <Play className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSkip} disabled={phase === 'idle'} aria-label={t('todos.pomoSkip')}>
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onReset} aria-label={t('todos.pomoReset')}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
