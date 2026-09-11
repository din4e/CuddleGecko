import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Loader2 } from 'lucide-react'
import { isoToLocalInput } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { StarRating } from './StarRating'
import { useCreateBodyMetric, useUpdateBodyMetric } from '../hooks/api/useBodyMetrics'
import type { BodyMetric, BodyMetricInput } from '../types'

interface BodyRecordFormDialogProps {
  open: boolean
  editing: BodyMetric | null
  onClose: () => void
  /** Latest record before today (falls back to the newest record) — the
   *  "copy previous day" source for quick daily logging. */
  copyFrom?: BodyMetric | null
}

export function BodyRecordFormDialog({ open, editing, onClose, copyFrom }: BodyRecordFormDialogProps) {
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
  const [bedtime, setBedtime] = useState(editing?.bedtime ? isoToLocalInput(editing.bedtime) : '')
  const [wakeTime, setWakeTime] = useState(editing?.wake_time ? isoToLocalInput(editing.wake_time) : '')
  const [sleepScore, setSleepScore] = useState<number | null>(editing?.sleep_score ?? null)
  const [steps, setSteps] = useState(editing?.steps != null ? String(editing.steps) : '')
  const [energy, setEnergy] = useState<number | null>(editing?.energy ?? null)
  const [mood, setMood] = useState<number | null>(editing?.mood ?? null)
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
      bedtime: bedtime ? new Date(bedtime).toISOString() : null,
      wake_time: wakeTime ? new Date(wakeTime).toISOString() : null,
      sleep_score: sleepScore,
      steps: steps ? parseInt(steps, 10) : null,
      energy,
      mood,
      notes,
    }
    if (editing) {
      await updateMetric.mutateAsync({ id: editing.id, data })
    } else {
      await createMetric.mutateAsync(data)
    }
    onClose()
  }, [editing, recordedAt, weight, height, bodyFat, muscleMass, restingHr, systolic, diastolic, sleepHours, bedtime, wakeTime, sleepScore, steps, energy, mood, notes, createMetric, updateMetric, onClose])

  // Sleep detail block: filling both bedtime and wake time auto-fills the
  // duration, so manual entry stays consistent with the imported data.
  const onBedtimeChange = (v: string) => {
    setBedtime(v)
    autoFillSleepHours(v, wakeTime)
  }
  const onWakeTimeChange = (v: string) => {
    setWakeTime(v)
    autoFillSleepHours(bedtime, v)
  }
  const autoFillSleepHours = (bed: string, wake: string) => {
    if (!bed || !wake) return
    const start = new Date(bed).getTime()
    const end = new Date(wake).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return
    setSleepHours(String(Math.round(((end - start) / 3600000) * 100) / 100))
  }

  // One-click daily logging: prefill every measured value from the previous
  // day's record (recorded_at stays "now"; notes are personal text, not a
  // parameter, so they are not copied).
  const copyPrevDay = () => {
    if (!copyFrom) return
    setWeight(copyFrom.weight != null ? String(copyFrom.weight) : '')
    setHeight(copyFrom.height != null ? String(copyFrom.height) : '')
    setBodyFat(copyFrom.body_fat != null ? String(copyFrom.body_fat) : '')
    setMuscleMass(copyFrom.muscle_mass != null ? String(copyFrom.muscle_mass) : '')
    setRestingHr(copyFrom.resting_hr != null ? String(copyFrom.resting_hr) : '')
    setSystolic(copyFrom.systolic != null ? String(copyFrom.systolic) : '')
    setDiastolic(copyFrom.diastolic != null ? String(copyFrom.diastolic) : '')
    setSleepHours(copyFrom.sleep_hours != null ? String(copyFrom.sleep_hours) : '')
    setBedtime(copyFrom.bedtime ? isoToLocalInput(copyFrom.bedtime) : '')
    setWakeTime(copyFrom.wake_time ? isoToLocalInput(copyFrom.wake_time) : '')
    setSleepScore(copyFrom.sleep_score ?? null)
    setSteps(copyFrom.steps != null ? String(copyFrom.steps) : '')
    setEnergy(copyFrom.energy ?? null)
    setMood(copyFrom.mood ?? null)
  }

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
        {!editing && copyFrom && (
          <Button variant="outline" size="sm" className="w-full" onClick={copyPrevDay}>
            <Copy className="h-4 w-4 mr-1" />{t('fitness.copyPrevDay')}
          </Button>
        )}
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
            {num(t('fitness.steps'), steps, setSteps, { step: '1' })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('fitness.bedtime')}</Label>
              <Input type="datetime-local" value={bedtime} onChange={(e) => onBedtimeChange(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fitness.wakeTime')}</Label>
              <Input type="datetime-local" value={wakeTime} onChange={(e) => onWakeTimeChange(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fitness.sleepScore')}</Label>
            <StarRating value={sleepScore} onChange={setSleepScore} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('fitness.energy')}</Label>
              <StarRating value={energy} onChange={setEnergy} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fitness.mood')}</Label>
              <StarRating value={mood} onChange={setMood} />
            </div>
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
