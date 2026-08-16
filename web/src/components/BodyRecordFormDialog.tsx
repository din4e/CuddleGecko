import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { isoToLocalInput } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { useCreateBodyMetric, useUpdateBodyMetric } from '../hooks/api/useBodyMetrics'
import type { BodyMetric, BodyMetricInput } from '../types'

interface BodyRecordFormDialogProps {
  open: boolean
  editing: BodyMetric | null
  onClose: () => void
}

export function BodyRecordFormDialog({ open, editing, onClose }: BodyRecordFormDialogProps) {
  const { t } = useTranslation()
  const createMetric = useCreateBodyMetric()
  const updateMetric = useUpdateBodyMetric()

  const now = () => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [recordedAt, setRecordedAt] = useState(editing?.recorded_at ? isoToLocalInput(editing.recorded_at) : now())
  const [weight, setWeight] = useState(editing?.weight != null ? String(editing.weight) : '')
  const [height, setHeight] = useState(editing?.height != null ? String(editing.height) : '')
  const [bodyFat, setBodyFat] = useState(editing?.body_fat != null ? String(editing.body_fat) : '')
  const [muscleMass, setMuscleMass] = useState(editing?.muscle_mass != null ? String(editing.muscle_mass) : '')
  const [restingHr, setRestingHr] = useState(editing?.resting_hr != null ? String(editing.resting_hr) : '')
  const [systolic, setSystolic] = useState(editing?.systolic != null ? String(editing.systolic) : '')
  const [diastolic, setDiastolic] = useState(editing?.diastolic != null ? String(editing.diastolic) : '')
  const [sleepHours, setSleepHours] = useState(editing?.sleep_hours != null ? String(editing.sleep_hours) : '')
  const [steps, setSteps] = useState(editing?.steps != null ? String(editing.steps) : '')
  const [energy, setEnergy] = useState(editing?.energy != null ? String(editing.energy) : '')
  const [mood, setMood] = useState(editing?.mood != null ? String(editing.mood) : '')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const handleSave = useCallback(async () => {
    const data: BodyMetricInput = {
      recorded_at: recordedAt ? new Date(recordedAt).toISOString() : undefined,
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseFloat(height) : null,
      body_fat: bodyFat ? parseFloat(bodyFat) : null,
      muscle_mass: muscleMass ? parseFloat(muscleMass) : null,
      resting_hr: restingHr ? parseInt(restingHr, 10) : null,
      systolic: systolic ? parseInt(systolic, 10) : null,
      diastolic: diastolic ? parseInt(diastolic, 10) : null,
      sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
      steps: steps ? parseInt(steps, 10) : null,
      energy: energy ? parseInt(energy, 10) : null,
      mood: mood ? parseInt(mood, 10) : null,
      notes,
    }
    if (editing) {
      await updateMetric.mutateAsync({ id: editing.id, data })
    } else {
      await createMetric.mutateAsync(data)
    }
    onClose()
  }, [editing, recordedAt, weight, height, bodyFat, muscleMass, restingHr, systolic, diastolic, sleepHours, steps, energy, mood, notes, createMetric, updateMetric, onClose])

  // num takes a label + state setter pair to keep the field grid DRY.
  const num = (label: string, val: string, set: (v: string) => void, opts: { step?: string; min?: string } = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step={opts.step ?? '0.01'} min={opts.min ?? '0'} value={val} onChange={(e) => set(e.target.value)} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t('fitness.editBodyRecord') : t('fitness.newBodyRecord')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fitness.recordedAt')}</Label>
            <Input type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {num(t('fitness.weight'), weight, setWeight)}
            {num(t('fitness.height'), height, setHeight)}
            {num(t('fitness.bodyFat'), bodyFat, setBodyFat)}
            {num(t('fitness.muscleMass'), muscleMass, setMuscleMass)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {num(t('fitness.restingHr'), restingHr, setRestingHr, { step: '1' })}
            {num(t('fitness.sleepHours'), sleepHours, setSleepHours)}
            {num(t('fitness.bloodPressure') + ' (' + t('fitness.systolic') + ')', systolic, setSystolic, { step: '1' })}
            {num(t('fitness.bloodPressure') + ' (' + t('fitness.diastolic') + ')', diastolic, setDiastolic, { step: '1' })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {num(t('fitness.steps'), steps, setSteps, { step: '1' })}
            {num(`${t('fitness.energy')} (1-5)`, energy, setEnergy, { step: '1', min: '1' })}
            {num(`${t('fitness.mood')} (1-5)`, mood, setMood, { step: '1', min: '1' })}
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={createMetric.isPending || updateMetric.isPending}>
            {(createMetric.isPending || updateMetric.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
