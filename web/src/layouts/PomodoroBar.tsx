import { memo, useEffect } from 'react'
import { usePomodoroStore } from '../stores/pomodoro'
import { usePomodoroTodo } from '../hooks/api/useTodos'
import { PomodoroTimer } from '../components/PomodoroTimer'

/**
 * PomodoroBar isolates the pomodoro store subscription from AppLayout. The
 * store ticks every second — subscribing in AppLayout itself re-rendered the
 * entire layout (sidebar, dropdowns, and the active page via <Outlet/>) once
 * per second for the whole 25-minute session. Here only this small bar
 * re-renders on ticks.
 */
export const PomodoroBar = memo(function PomodoroBar() {
  const pomodoroMutation = usePomodoroTodo()

  // Register the completion persistence once — the callback reads current
  // store state via getState(), so it never goes stale (the previous code
  // re-registered on every store change, i.e. every second).
  useEffect(() => {
    usePomodoroStore.getState().setOnComplete(() => {
      const id = usePomodoroStore.getState().focusTodoId
      if (id != null) pomodoroMutation.mutate(id)
    })
  }, [pomodoroMutation])

  const phase = usePomodoroStore((s) => s.phase)
  const focusTodoId = usePomodoroStore((s) => s.focusTodoId)
  const secondsLeft = usePomodoroStore((s) => s.secondsLeft)
  const running = usePomodoroStore((s) => s.running)
  const focusTodoTitle = usePomodoroStore((s) => s.focusTodoTitle)

  if (phase === 'idle' && focusTodoId == null) return null

  return (
    <div className="mb-4 max-w-md">
      <PomodoroTimer
        phase={phase}
        secondsLeft={secondsLeft}
        running={running}
        focusTodoTitle={focusTodoTitle}
        onStart={() => usePomodoroStore.getState().start(null)}
        onPause={() => usePomodoroStore.getState().pause()}
        onReset={() => usePomodoroStore.getState().reset()}
        onSkip={() => usePomodoroStore.getState().skip()}
      />
    </div>
  )
})
