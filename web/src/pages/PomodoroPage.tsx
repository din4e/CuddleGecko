import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ListPageHeader from '../components/ListPageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Play, Pause, RotateCcw, Coffee, Brain, Timer, CheckCircle2, Clock, Flame, Link2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { usePomodoroSummary, useRecordPomodoro } from '../hooks/api/usePomodoros'
import { useTodosList } from '../hooks/api/useTodos'

type Mode = 'focus' | 'break'
const WORK_KEY = 'pomo_work_min'
const BREAK_KEY = 'pomo_break_min'
const EMPTY_TODOS: { id: string; title: string }[] = []

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PomodoroPage() {
  const { t } = useTranslation()
  const [workMin, setWorkMin] = useState<number>(Number(localStorage.getItem(WORK_KEY)) || 25)
  const [breakMin, setBreakMin] = useState<number>(Number(localStorage.getItem(BREAK_KEY)) || 5)
  const [mode, setMode] = useState<Mode>('focus')
  const [secondsLeft, setSecondsLeft] = useState(workMin * 60)
  const [running, setRunning] = useState(false)
  const [todoId, setTodoId] = useState<string | ''>('')
  const record = useRecordPomodoro()
  const { data: summary } = usePomodoroSummary()
  const { data: todosData } = useTodosList({ status: 'pending', page: 1, page_size: 30 })
  const todos = todosData?.items ?? EMPTY_TODOS

  const totalForMode = (mode === 'focus' ? workMin : breakMin) * 60
  const pct = totalForMode > 0 ? ((totalForMode - secondsLeft) / totalForMode) * 100 : 0

  const durationFor = useCallback((nextMode: Mode, nextWorkMin = workMin, nextBreakMin = breakMin) => (
    (nextMode === 'focus' ? nextWorkMin : nextBreakMin) * 60
  ), [breakMin, workMin])

  const resetTimer = useCallback((nextMode = mode, nextWorkMin = workMin, nextBreakMin = breakMin) => {
    setRunning(false)
    setSecondsLeft(durationFor(nextMode, nextWorkMin, nextBreakMin))
  }, [breakMin, durationFor, mode, workMin])

  const selectMode = (nextMode: Mode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    resetTimer(nextMode)
  }

  const persistWork = (value: number) => {
    const next = Math.min(120, Math.max(1, value || 25))
    setWorkMin(next)
    localStorage.setItem(WORK_KEY, String(next))
    if (mode === 'focus') resetTimer('focus', next, breakMin)
  }

  const persistBreak = (value: number) => {
    const next = Math.min(60, Math.max(1, value || 5))
    setBreakMin(next)
    localStorage.setItem(BREAK_KEY, String(next))
    if (mode === 'break') resetTimer('break', workMin, next)
  }

  const completionRef = useRef(false)
  const completeSession = useCallback(() => {
    const completedMode = mode
    const nextMode: Mode = completedMode === 'focus' ? 'break' : 'focus'
    setRunning(false)
    if (completedMode === 'focus') {
      record.mutate({ duration_seconds: workMin * 60, kind: 'focus', completed: true, todo_id: todoId || null })
      toast.success(t('pomo.focusDone', { min: workMin }))
    } else {
      toast.success(t('pomo.breakDone'))
    }
    setMode(nextMode)
    setSecondsLeft(durationFor(nextMode))
    completionRef.current = false
  }, [durationFor, mode, record, t, todoId, workMin])

  // tick
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!)
          if (!completionRef.current) {
            completionRef.current = true
            window.setTimeout(completeSession, 0)
          }
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [completeSession, running])

  const radius = 112
  const circ = 2 * Math.PI * radius
  const focus = mode === 'focus'
  const todayCount = summary?.today_count ?? 0

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('pomo.title')}
        actions={
          <div className="flex overflow-hidden rounded-md border">
            <Button variant={focus ? 'default' : 'ghost'} size="sm" className="rounded-none px-3" onClick={() => selectMode('focus')}>
              <Brain />{t('pomo.focus')}
            </Button>
            <Button variant={!focus ? 'default' : 'ghost'} size="sm" className="rounded-none px-3" onClick={() => selectMode('break')}>
              <Coffee />{t('pomo.break')}
            </Button>
          </div>
        }
      />

      {/* Stats — one full-bleed card, four cells */}
      <Card className="py-0 shadow-sm">
        <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-4 sm:divide-y-0">
          <StatCell icon={<CheckCircle2 className="h-4 w-4" />} tone="green" label={t('pomo.todayCount')} value={todayCount} />
          <StatCell icon={<Timer className="h-4 w-4" />} tone="red" label={t('pomo.todayMin')} value={Math.round((summary?.today_seconds ?? 0) / 60)} />
          <StatCell icon={<Flame className="h-4 w-4" />} tone="orange" label={t('pomo.totalCount')} value={summary?.total_count ?? 0} />
          <StatCell icon={<Clock className="h-4 w-4" />} tone="blue" label={t('pomo.totalMin')} value={Math.round((summary?.total_seconds ?? 0) / 60)} />
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden shadow-sm">
        <CardContent className="flex flex-col items-center gap-8 p-6 sm:p-10 lg:flex-row lg:justify-center lg:gap-16">
          {/* Ring timer with mode-tinted ambient glow */}
          <div className="relative shrink-0">
            <div
              aria-hidden
              className={[
                'absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl',
                focus ? 'bg-red-500/10 dark:bg-red-500/15' : 'bg-green-500/10 dark:bg-green-500/15',
                running ? 'animate-pomo-breathe' : '',
              ].join(' ')}
            />
            <svg width="260" height="260" className="relative -rotate-90">
              <circle cx="130" cy="130" r={radius} fill="none" stroke="currentColor" className="text-muted/25" strokeWidth="14" />
              <circle
                cx="130" cy="130" r={radius} fill="none"
                stroke={focus ? '#ef4444' : '#22c55e'} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
                style={{
                  transition: 'stroke-dashoffset 1s linear',
                  filter: `drop-shadow(0 0 8px ${focus ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'})`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span className={`flex size-10 items-center justify-center rounded-full ${focus ? 'bg-red-500/10 text-red-500 dark:bg-red-500/15' : 'bg-green-500/10 text-green-500 dark:bg-green-500/15'}`}>
                {focus ? <Brain className="h-5 w-5" /> : <Coffee className="h-5 w-5" />}
              </span>
              <span className="text-5xl font-bold tabular-nums tracking-tight">{fmt(secondsLeft)}</span>
              <span className="text-sm text-muted-foreground">{focus ? t('pomo.focus') : t('pomo.break')}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex w-full max-w-xs flex-col gap-5">
            <div className="flex items-center justify-center gap-2">
              <Button
                size="lg"
                disabled={secondsLeft === 0}
                onClick={() => setRunning((r) => !r)}
                className={`h-10 flex-1 text-[0.95rem] text-white transition-colors ${focus ? 'bg-red-500 hover:bg-red-500/90' : 'bg-green-500 hover:bg-green-500/90'}`}
              >
                {running ? <><Pause />{t('pomo.pause')}</> : <><Play />{t('pomo.start')}</>}
              </Button>
              <Button size="lg" variant="outline" className="size-10 p-0" title={t('pomo.reset')} aria-label={t('pomo.reset')} onClick={() => resetTimer()}>
                <RotateCcw />
              </Button>
            </div>

            {todayCount > 0 && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" aria-label={t('pomo.todayCount')}>
                {Array.from({ length: Math.min(todayCount, 8) }).map((_, i) => (
                  <span key={i} className="size-2 rounded-full bg-red-500/80" aria-hidden />
                ))}
                {todayCount > 8 && <span>+{todayCount - 8}</span>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 border-t pt-5">
              <Stepper label={t('pomo.focusMin')} value={workMin} min={1} max={120} onChange={persistWork} />
              <Stepper label={t('pomo.breakMin')} value={breakMin} min={1} max={60} onChange={persistBreak} />
            </div>

            {mode === 'focus' && todos.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">{t('pomo.linkTodo')}</span>
                <select value={todoId} onChange={(e) => setTodoId(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-transparent px-2 text-sm transition-colors hover:border-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">{t('pomo.noLink')}</option>
                  {todos.map((td) => (<option key={td.id} value={td.id}>{td.title}</option>))}
                </select>
              </label>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const TONE_CLASSES: Record<string, string> = {
  green: 'bg-green-500/10 text-green-600 dark:text-green-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

function StatCell({ icon, tone, label, value }: { icon: ReactNode; label: string; value: number; tone: keyof typeof TONE_CLASSES }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums leading-tight">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-9 items-center overflow-hidden rounded-md border border-border bg-background">
        <button type="button" aria-label={`${label} -1`} onClick={() => onChange(clamp(value - 1))}
          className="flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-9 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button type="button" aria-label={`${label} +1`} onClick={() => onChange(clamp(value + 1))}
          className="flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
