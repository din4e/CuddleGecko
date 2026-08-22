import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Plus, Loader2, ChevronDown, ChevronRight, Award } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import EmptyState from './EmptyState'
import {
  useWorkoutExercises,
  useCreateWorkoutExercise,
  useToggleWorkoutExercise,
  useDeleteWorkoutExercise,
  useWorkoutPrs,
  useSetLogs,
  useSetLogMutations,
} from '../hooks/api/useWorkouts'
import { prFor } from '../lib/fitness'
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
  const { data: prs } = useWorkoutPrs()
  const createEx = useCreateWorkoutExercise(workoutId)
  const toggleEx = useToggleWorkoutExercise(workoutId)
  const deleteEx = useDeleteWorkoutExercise(workoutId)
  const [draft, setDraft] = useState('')
  // Lazily fetched set logs: expanded exercise ids only.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggleExpand = (exerciseId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(exerciseId)) next.delete(exerciseId)
      else next.add(exerciseId)
      return next
    })
  }

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
        <div key={e.id} className="rounded-md border px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleExpand(e.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('fitness.setLogs')}
            >
              {expanded.has(e.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
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
            {prs && prFor(prs, e.name) && <PrBadge pr={prFor(prs, e.name)!} />}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => deleteEx.mutate(e.id)} aria-label={t('fitness.deleteExercise')}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {expanded.has(e.id) && <SetLogRows workoutId={workoutId} exerciseId={e.id} />}
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

function PrBadge({ pr }: { pr: { best_weight: number; best_e1rm: number } }) {
  const { t } = useTranslation()
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
      title={t('fitness.prTitle')}
    >
      <Award className="h-3 w-3" />
      {pr.best_weight}kg · e1RM {Math.round(pr.best_e1rm)}
    </span>
  )
}

function SetLogRows({ workoutId, exerciseId }: { workoutId: number; exerciseId: number }) {
  const { t } = useTranslation()
  const { data: sets, isLoading } = useSetLogs(workoutId, exerciseId, true)
  const { create, update, remove } = useSetLogMutations(workoutId, exerciseId)
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')

  const addSet = async () => {
    if (!reps.trim() && !weight.trim()) return
    await create.mutateAsync({
      reps: reps ? parseInt(reps, 10) : null,
      weight: weight ? parseFloat(weight) : null,
    })
    setReps('')
    setWeight('')
  }

  return (
    <div className="mt-1.5 space-y-1 border-t pt-1.5 pl-6">
      {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {sets && sets.length === 0 && <p className="text-xs text-muted-foreground">{t('fitness.noSets')}</p>}
      {sets?.map((s) => (
        <div key={s.id} className="flex items-center gap-2 text-xs">
          <span className="w-8 text-muted-foreground">#{s.set_index}</span>
          <input
            type="checkbox"
            checked={s.done}
            onChange={() => update.mutate({ setId: s.id, data: { done: !s.done } })}
            className="h-3.5 w-3.5 accent-primary"
            aria-label={t('fitness.markDone')}
          />
          <span className="flex-1">
            {s.reps != null && `${s.reps} ${t('fitness.repsShort')}`}
            {s.weight != null && ` · ${s.weight}kg`}
          </span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => remove.mutate(s.id)} aria-label={t('fitness.deleteSet')}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-1.5 pt-0.5">
        <Input type="number" min={0} value={reps} onChange={(e) => setReps(e.target.value)} placeholder={t('fitness.reps')} className="h-7 w-20 text-xs" />
        <Input type="number" min={0} step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={t('fitness.weight')} className="h-7 w-20 text-xs" />
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={addSet} disabled={(!reps.trim() && !weight.trim()) || create.isPending}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
