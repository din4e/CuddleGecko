import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { useCreateWorkout, useUpdateWorkout } from '../hooks/api/useWorkouts'
import type { Workout, WorkoutType, WorkoutStatus, WorkoutIntensity, WorkoutUpdateInput } from '../types'

const COLORS = [
  { value: '', label: 'Default' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
]

const TYPES: WorkoutType[] = ['strength', 'cardio', 'flexibility', 'balance', 'sport', 'other']
const STATUSES: WorkoutStatus[] = ['planned', 'in_progress', 'completed', 'skipped']
const INTENSITIES: WorkoutIntensity[] = ['', 'low', 'medium', 'high']

interface WorkoutFormDialogProps {
  open: boolean
  editing: Workout | null
  onClose: () => void
}

export function WorkoutFormDialog({ open, editing, onClose }: WorkoutFormDialogProps) {
  const { t } = useTranslation()
  const createWorkout = useCreateWorkout()
  const updateWorkout = useUpdateWorkout()

  const [name, setName] = useState(editing?.name ?? '')
  const [wType, setWType] = useState<WorkoutType>(editing?.type ?? 'other')
  const [status, setStatus] = useState<WorkoutStatus>(editing?.status ?? 'planned')
  const [intensity, setIntensity] = useState<WorkoutIntensity>(editing?.intensity ?? '')
  const [scheduledAt, setScheduledAt] = useState(editing?.scheduled_at ? editing.scheduled_at.slice(0, 16) : '')
  const [duration, setDuration] = useState(editing?.duration_min != null ? String(editing.duration_min) : '')
  const [calories, setCalories] = useState(editing?.calories != null ? String(editing.calories) : '')
  const [location, setLocation] = useState(editing?.location ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [color, setColor] = useState(editing?.color ?? '')

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    if (editing) {
      const data: WorkoutUpdateInput = {
        name: name.trim(),
        type: wType,
        status,
        intensity,
        location,
        notes,
        color,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        duration_min: duration ? parseInt(duration, 10) : null,
        calories: calories ? parseFloat(calories) : null,
      }
      if (editing.scheduled_at && !scheduledAt) data.clear_scheduled_at = true
      if (editing.duration_min != null && !duration) data.clear_duration_min = true
      if (editing.calories != null && !calories) data.clear_calories = true
      await updateWorkout.mutateAsync({ id: editing.id, data })
    } else {
      await createWorkout.mutateAsync({
        name: name.trim(),
        type: wType,
        status,
        intensity,
        location,
        notes,
        color,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        duration_min: duration ? parseInt(duration, 10) : undefined,
        calories: calories ? parseFloat(calories) : undefined,
      })
    }
    onClose()
  }, [editing, name, wType, status, intensity, location, notes, color, scheduledAt, duration, calories, createWorkout, updateWorkout, onClose])

  const cls = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('fitness.editWorkout') : t('fitness.newWorkout')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fitness.name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('fitness.type')}</Label>
              <select className={cls} value={wType} onChange={(e) => setWType(e.target.value as WorkoutType)}>
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>{t(`fitness.type${cap(ty)}`)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('fitness.status')}</Label>
              <select className={cls} value={status} onChange={(e) => setStatus(e.target.value as WorkoutStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`fitness.status${cap(s)}`)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('fitness.intensity')}</Label>
              <select className={cls} value={intensity} onChange={(e) => setIntensity(e.target.value as WorkoutIntensity)}>
                {INTENSITIES.map((iv) => (
                  <option key={iv} value={iv}>{iv === '' ? t('fitness.intensityNone') : t(`fitness.intensity${cap(iv)}`)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('fitness.scheduledAt')}</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('fitness.duration')}</Label>
              <Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fitness.calories')}</Label>
              <Input type="number" min={0} step="0.1" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.location')}</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.color')}</Label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`h-6 w-6 rounded-full border-2 transition-colors ${color === c.value ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value || 'transparent', backgroundImage: c.value ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || createWorkout.isPending || updateWorkout.isPending}>
            {(createWorkout.isPending || updateWorkout.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function cap(s: string) {
  // Turn e.g. "in_progress" → "InProgress", "cardio" → "Cardio" for i18n keys.
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}
