import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import EmptyState from './EmptyState'
import {
  useWorkoutExercises,
  useCreateWorkoutExercise,
  useToggleWorkoutExercise,
  useDeleteWorkoutExercise,
} from '../hooks/api/useWorkouts'
import type { WorkoutExercise } from '../types'

// exerciseSummary renders a compact spec string, e.g. "4 × 8 @ 60kg" or "5km / 30:00".
function exerciseSummary(e: WorkoutExercise): string {
  const parts: string[] = []
  if (e.sets != null && e.reps != null) parts.push(`${e.sets} × ${e.reps}`)
  else if (e.sets != null) parts.push(`${e.sets} sets`)
  else if (e.reps != null) parts.push(`${e.reps} reps`)
  if (e.weight != null) parts.push(`@ ${e.weight}kg`)
  if (e.distance != null) parts.push(`${e.distance}km`)
  if (e.duration_sec != null) parts.push(fmtDuration(e.duration_sec))
  if (e.rest_sec != null) parts.push(`rest ${e.rest_sec}s`)
  return parts.join(' · ')
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

export function ExerciseList({ workoutId }: { workoutId: number }) {
  const { t } = useTranslation()
  const { data: exercises, isLoading } = useWorkoutExercises(workoutId)
  const createEx = useCreateWorkoutExercise(workoutId)
  const toggleEx = useToggleWorkoutExercise(workoutId)
  const deleteEx = useDeleteWorkoutExercise(workoutId)
  const [draft, setDraft] = useState('')

  const add = async () => {
    if (!draft.trim()) return
    await createEx.mutateAsync({ name: draft.trim() })
    setDraft('')
  }

  if (isLoading) {
    return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-1.5">
      {exercises && exercises.length === 0 && <EmptyState message={t('fitness.noExercises')} className="py-4" />}
      {exercises?.map((e) => (
        <div key={e.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
          <input
            type="checkbox"
            checked={e.done}
            onChange={() => toggleEx.mutate(e.id)}
            className="h-4 w-4 accent-primary"
            aria-label={e.done ? t('fitness.markIncomplete') : t('fitness.markDone')}
          />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm ${e.done ? 'line-through text-muted-foreground' : ''}`}>{e.name}</p>
            {exerciseSummary(e) && <p className="truncate text-xs text-muted-foreground">{exerciseSummary(e)}</p>}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => deleteEx.mutate(e.id)} aria-label={t('fitness.deleteExercise')}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder={t('fitness.addExercise')}
          className="h-8"
        />
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
