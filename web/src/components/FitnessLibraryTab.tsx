import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent } from './ui/card'
import { ConfirmDialog } from './ConfirmDialog'
import EmptyState from './EmptyState'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import {
  useExerciseLibrary,
  useExerciseLibraryMutations,
} from '../hooks/api/useExerciseLibrary'
import {
  useWorkoutTemplates,
  useWorkoutTemplateMutations,
} from '../hooks/api/useWorkoutTemplates'
import type {
  ExerciseLibraryItem,
  WorkoutTemplate,
  WorkoutTemplateItem,
  WorkoutType,
} from '../types'

const TYPES: WorkoutType[] = ['strength', 'cardio', 'flexibility', 'balance', 'sport', 'other']

function cap(s: string) {
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

// ---------------- Exercise library ----------------

export function ExerciseLibraryPanel() {
  const { t } = useTranslation()
  const { data: items, isLoading } = useExerciseLibrary()
  const { create, update, remove } = useExerciseLibraryMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ExerciseLibraryItem | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('fitness.exerciseLibrary')}</h2>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-1" />{t('fitness.newExercise')}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !items || items.length === 0 ? (
        <EmptyState message={t('fitness.noExercisesLibrary')} />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Card key={it.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{it.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[it.category, it.equipment, it.muscle_groups?.join(', ')].filter(Boolean).join(' · ')}
                  </p>
                  {it.notes && <p className="truncate text-xs text-muted-foreground">{it.notes}</p>}
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditing(it); setDialogOpen(true) }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setDeleteId(it.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExerciseLibraryDialog
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
        message={t('fitness.deleteConfirmExercise')}
        onConfirm={async () => { if (deleteId != null) await remove.mutateAsync(deleteId); setDeleteId(null) }}
      />
    </div>
  )
}

function ExerciseLibraryDialog({
  open,
  editing,
  onClose,
  onSave,
  pending,
}: {
  open: boolean
  editing: ExerciseLibraryItem | null
  onClose: () => void
  onSave: (data: { name: string; category: string; muscle_groups: string[]; equipment: string; notes: string }) => Promise<void>
  pending: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(editing?.name ?? '')
  const [category, setCategory] = useState(editing?.category ?? '')
  const [muscles, setMuscles] = useState(editing?.muscle_groups?.join(', ') ?? '')
  const [equipment, setEquipment] = useState(editing?.equipment ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('fitness.editExercise') : t('fitness.newExercise')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fitness.exerciseName')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('fitness.category')}</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fitness.equipment')}</Label>
              <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.muscleGroups')}</Label>
            <Input value={muscles} onChange={(e) => setMuscles(e.target.value)} placeholder={t('fitness.muscleGroupsHint')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() => onSave({
              name: name.trim(),
              category: category.trim(),
              muscle_groups: muscles.split(',').map((s) => s.trim()).filter(Boolean),
              equipment: equipment.trim(),
              notes,
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

// ---------------- Workout templates ----------------

type TemplateItemDraft = Omit<WorkoutTemplateItem, 'id'>

export function WorkoutTemplatesPanel() {
  const { t } = useTranslation()
  const { data: templates, isLoading } = useWorkoutTemplates()
  const { create, update, remove } = useWorkoutTemplateMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('fitness.workoutTemplates')}</h2>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-1" />{t('fitness.newTemplate')}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !templates || templates.length === 0 ? (
        <EmptyState message={t('fitness.noTemplates')} />
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{tpl.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`fitness.type${cap(tpl.type)}`)} · {tpl.items?.length ?? 0} {t('fitness.itemsCount')}
                  </p>
                  {tpl.notes && <p className="truncate text-xs text-muted-foreground">{tpl.notes}</p>}
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditing(tpl); setDialogOpen(true) }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setDeleteId(tpl.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
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
        message={t('fitness.deleteConfirmTemplate')}
        onConfirm={async () => { if (deleteId != null) await remove.mutateAsync(deleteId); setDeleteId(null) }}
      />
    </div>
  )
}

function TemplateDialog({
  open,
  editing,
  onClose,
  onSave,
  pending,
}: {
  open: boolean
  editing: WorkoutTemplate | null
  onClose: () => void
  onSave: (data: { name: string; type: WorkoutType; notes: string; items: TemplateItemDraft[] }) => Promise<void>
  pending: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState<WorkoutType>(editing?.type ?? 'strength')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [items, setItems] = useState<TemplateItemDraft[]>(
    editing?.items
      ? [...editing.items].sort((a, b) => a.sort_order - b.sort_order).map((it) => ({
        name: it.name,
        category: it.category,
        sets: it.sets,
        reps: it.reps,
        weight: it.weight,
        distance: it.distance,
        duration_sec: it.duration_sec,
        rest_sec: it.rest_sec,
        sort_order: it.sort_order,
      }))
      : [],
  )
  const [itemName, setItemName] = useState('')
  const [itemSets, setItemSets] = useState('')
  const [itemReps, setItemReps] = useState('')
  const [itemWeight, setItemWeight] = useState('')

  const cls = 'h-9 w-full rounded-md border bg-background px-2 text-sm'
  const inputCls = 'h-8 rounded-md border bg-background px-2 text-sm'

  const addItem = () => {
    if (!itemName.trim()) return
    setItems((prev) => [
      ...prev,
      {
        name: itemName.trim(),
        category: '',
        sets: itemSets ? parseInt(itemSets, 10) : null,
        reps: itemReps ? parseInt(itemReps, 10) : null,
        weight: itemWeight ? parseFloat(itemWeight) : null,
        distance: null,
        duration_sec: null,
        rest_sec: null,
        sort_order: prev.length,
      },
    ])
    setItemName(''); setItemSets(''); setItemReps(''); setItemWeight('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('fitness.editTemplate') : t('fitness.newTemplate')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fitness.name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.type')}</Label>
            <select className={cls} value={type} onChange={(e) => setType(e.target.value as WorkoutType)}>
              {TYPES.map((ty) => <option key={ty} value={ty}>{t(`fitness.type${cap(ty)}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.exercises')}</Label>
            {items.length === 0 && <p className="text-xs text-muted-foreground">{t('fitness.noExercises')}</p>}
            <ul className="space-y-1">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <span className="flex-1 truncate">
                    {it.name}
                    {it.sets != null && it.reps != null && ` · ${it.sets} × ${it.reps}`}
                    {it.weight != null && ` @ ${it.weight}kg`}
                  </span>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} aria-label={t('fitness.deleteExercise')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t('fitness.exerciseName')} className={`${inputCls} w-32`} />
              <Input type="number" min={0} value={itemSets} onChange={(e) => setItemSets(e.target.value)} placeholder={t('fitness.sets')} className={`${inputCls} w-16`} />
              <Input type="number" min={0} value={itemReps} onChange={(e) => setItemReps(e.target.value)} placeholder={t('fitness.reps')} className={`${inputCls} w-16`} />
              <Input type="number" min={0} step="0.5" value={itemWeight} onChange={(e) => setItemWeight(e.target.value)} placeholder={t('fitness.weight')} className={`${inputCls} w-20`} />
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={addItem} disabled={!itemName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!name.trim() || pending} onClick={() => onSave({ name: name.trim(), type, notes, items })}>
            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
