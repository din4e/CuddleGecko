import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Play, Pause, RotateCcw, Coffee, Brain, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { usePomodoroSummary, useRecordPomodoro } from '../hooks/api/usePomodoros'
import { useTodosList } from '../hooks/api/useTodos'

type Mode = 'focus' | 'break'
const WORK_KEY = 'pomo_work_min'
const BREAK_KEY = 'pomo_break_min'
const EMPTY_TODOS: { id: number; title: string }[] = []

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
  const [todoId, setTodoId] = useState<number | ''>('')
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

  const radius = 90
  const circ = 2 * Math.PI * radius

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('pomo.title')}</h1>
        <div className="flex gap-2">
          <Button variant={mode === 'focus' ? 'default' : 'outline'} size="sm" onClick={() => selectMode('focus')}>
            <Brain className="h-4 w-4 mr-1" />{t('pomo.focus')}
          </Button>
          <Button variant={mode === 'break' ? 'default' : 'outline'} size="sm" onClick={() => selectMode('break')}>
            <Coffee className="h-4 w-4 mr-1" />{t('pomo.break')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label={t('pomo.todayCount')} value={summary?.today_count ?? 0} />
        <StatCard label={t('pomo.todayMin')} value={Math.round((summary?.today_seconds ?? 0) / 60)} />
        <StatCard label={t('pomo.totalCount')} value={summary?.total_count ?? 0} />
        <StatCard label={t('pomo.totalMin')} value={Math.round((summary?.total_seconds ?? 0) / 60)} />
      </div>

      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center gap-5 p-6 sm:p-8">
          <div className="relative">
            <svg width="220" height="220" className="-rotate-90">
              <circle cx="110" cy="110" r={radius} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="12" />
              <circle
                cx="110" cy="110" r={radius} fill="none"
                stroke={mode === 'focus' ? '#ef4444' : '#22c55e'} strokeWidth="12" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Timer className="h-5 w-5 text-muted-foreground mb-1" />
              <span className="text-4xl font-bold tabular-nums">{fmt(secondsLeft)}</span>
              <Badge variant="secondary" className="mt-1">{mode === 'focus' ? t('pomo.focus') : t('pomo.break')}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="lg" onClick={() => setRunning((r) => !r)} disabled={secondsLeft === 0}>
              {running ? <><Pause className="h-5 w-5 mr-1" />{t('pomo.pause')}</> : <><Play className="h-5 w-5 mr-1" />{t('pomo.start')}</>}
            </Button>
            <Button size="lg" variant="outline" onClick={() => resetTimer()}>
              <RotateCcw className="h-5 w-5 mr-1" />{t('pomo.reset')}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            <label className="flex items-center gap-2 text-sm">
              {t('pomo.focusMin')}
              <Input type="number" min={1} max={120} value={workMin} onChange={(e) => persistWork(Number(e.target.value) || 25)} className="h-8 w-20" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              {t('pomo.breakMin')}
              <Input type="number" min={1} max={60} value={breakMin} onChange={(e) => persistBreak(Number(e.target.value) || 5)} className="h-8 w-20" />
            </label>
          </div>

          {mode === 'focus' && todos.length > 0 && (
            <label className="flex items-center gap-2 text-sm w-full max-w-sm">
              {t('pomo.linkTodo')}
              <select value={todoId} onChange={(e) => setTodoId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 h-9 rounded-md border border-border bg-transparent px-2 text-sm">
                <option value="">{t('pomo.noLink')}</option>
                {todos.map((td) => (<option key={td.id} value={td.id}>{td.title}</option>))}
              </select>
            </label>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}
