import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Loader2, Target } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { useFitnessGoals, useFitnessGoalMutations } from '../hooks/api/useFitnessGoals'
import { goalPercent } from '../lib/fitness'
import { isoToLocalInput } from '../lib/utils'
import type { FitnessGoal, FitnessGoalType } from '../types'

/** Goals card shown on the Workouts tab: progress bars + CRUD dialog. */
export function FitnessGoalCard() {
  const { t } = useTranslation()
  const { data: goals } = useFitnessGoals()
  const { create, update, remove } = useFitnessGoalMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FitnessGoal | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-pink-500" />
          {t('fitness.goals')}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-1" />{t('fitness.newGoal')}
        </Button>
      </CardHeader>
      <CardContent>
        {!goals || goals.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{t('fitness.noGoals')}</p>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => {
              const pct = goalPercent(g)
              return (
                <li key={g.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">
                      {t(g.type === 'weekly_workouts' ? 'fitness.goalWeeklyWorkouts' : 'fitness.goalWeightTarget')}
                      {g.deadline && <span className="ml-2 text-xs text-muted-foreground">{new Date(g.deadline).toLocaleDateString()}</span>}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {g.type === 'weight_target' ? `${g.current_value}/${g.target_value}kg` : `${g.current_value}/${g.target_value}`} · {pct}%
                    </span>
                    {g.status === 'active' && pct >= 100 ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => update.mutate({ id: g.id, data: { status: 'done' } })}>
                        {t('fitness.markGoalDone')}
                      </Button>
                    ) : g.status === 'done' && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => update.mutate({ id: g.id, data: { status: 'active' } })}>
                        {t('fitness.markGoalActive')}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditing(g); setDialogOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setDeleteId(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${g.status === 'done' ? 'bg-green-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <GoalDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSave={async (data) => {
          if (editing) await update.mutateAsync({ id: editing.id, data })
          else await create.mutateAsync(data)
          setDialogOpen(false)
        }}
        pending={create.isPending || update.isPending}
      />
      <ConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => { if (!o) setDeleteId(null) }}
        message={t('fitness.deleteConfirmGoal')}
        onConfirm={async () => { if (deleteId != null) await remove.mutateAsync(deleteId); setDeleteId(null) }}
      />
    </Card>
  )
}

function GoalDialog({
  open,
  editing,
  onClose,
  onSave,
  pending,
}: {
  open: boolean
  editing: FitnessGoal | null
  onClose: () => void
  onSave: (data: { type: FitnessGoalType; target_value: number; deadline: string | null }) => Promise<void>
  pending: boolean
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<FitnessGoalType>(editing?.type ?? 'weekly_workouts')
  const [target, setTarget] = useState(editing?.target_value != null ? String(editing.target_value) : '')
  const [deadline, setDeadline] = useState(editing?.deadline ? isoToLocalInput(editing.deadline) : '')

  const cls = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? t('fitness.editGoal') : t('fitness.newGoal')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('common.type')}</Label>
            <select className={cls} value={type} onChange={(e) => setType(e.target.value as FitnessGoalType)}>
              <option value="weekly_workouts">{t('fitness.goalWeeklyWorkouts')}</option>
              <option value="weight_target">{t('fitness.goalWeightTarget')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{type === 'weight_target' ? t('fitness.goalTargetWeight') : t('fitness.goalTargetCount')} *</Label>
            <Input type="number" min={0} step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.goalDeadline')}</Label>
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={!target || parseFloat(target) <= 0 || pending}
            onClick={() => onSave({
              type,
              target_value: parseFloat(target),
              deadline: deadline ? new Date(deadline).toISOString() : null,
            })}
          >
            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
