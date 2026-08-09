import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Pencil, Trash2, Clock, Flame, MapPin, Dumbbell } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { ConfirmDialog } from './ConfirmDialog'
import { ExerciseList } from './ExerciseList'
import { useToggleWorkout, useDeleteWorkout } from '../hooks/api/useWorkouts'
import type { Workout } from '../types'

const typeColor: Record<string, string> = {
  strength: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  cardio: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  flexibility: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  balance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  sport: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const statusBadge: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  skipped: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

export interface WorkoutCardProps {
  workout: Workout
  onEdit: (w: Workout) => void
  formatDate: (dateStr: string | null) => string
}

export function WorkoutCard({ workout, onEdit, formatDate }: WorkoutCardProps) {
  const { t } = useTranslation()
  const toggleWorkout = useToggleWorkout()
  const deleteWorkout = useDeleteWorkout()
  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const completed = workout.status === 'completed'
  const total = workout.item_total ?? 0
  const done = workout.item_done ?? 0
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card className={completed ? 'opacity-70' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => toggleWorkout.mutate(workout.id)}
            className="mt-0.5 shrink-0"
            aria-label={completed ? t('fitness.markIncomplete') : t('fitness.markDone')}
          >
            {completed
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <Circle className="h-5 w-5 text-muted-foreground" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className={`truncate font-medium ${completed ? 'line-through text-muted-foreground' : ''}`}>{workout.name}</h3>
              {workout.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: workout.color }} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className={typeColor[workout.type] ?? typeColor.other}>{t(`fitness.type${cap(workout.type)}`)}</Badge>
              <Badge variant="secondary" className={statusBadge[workout.status] ?? statusBadge.planned}>{t(`fitness.status${cap(workout.status)}`)}</Badge>
              {workout.intensity && (
                <Badge variant="outline">{t('fitness.intensity')}: {t(`fitness.intensity${cap(workout.intensity)}`)}</Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {workout.scheduled_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(workout.scheduled_at)}</span>}
              {workout.duration_min != null && <span className="inline-flex items-center gap-1"><Dumbbell className="h-3 w-3" />{workout.duration_min} {t('fitness.minutesShort')}</span>}
              {workout.calories != null && <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" />{workout.calories} kcal</span>}
              {workout.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{workout.location}</span>}
            </div>

            {total > 0 && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{done}/{total} · {progress}%</p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpanded((v) => !v)} aria-label={t('fitness.exercises')}>
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit(workout)} aria-label={t('fitness.editWorkout')}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setConfirmOpen(true)} aria-label={t('fitness.deleteWorkout')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('fitness.exercises')}</p>
            <ExerciseList workoutId={workout.id} />
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        message={t('fitness.deleteConfirmWorkout')}
        onConfirm={async () => { await deleteWorkout.mutateAsync(workout.id) }}
      />
    </Card>
  )
}

function cap(s: string) {
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}
