import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Eye, EyeOff, Hourglass, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ListPageHeader from '../components/ListPageHeader'
import { useCountdownStore } from '../stores/countdown'
import { formatCountdown, remainingSeconds, toLocalInputValue } from '../lib/countdown'
import { isoToLocalInput } from '../lib/utils'
import { cn } from '@/lib/utils'

const QUICK_MINUTES = [5, 10, 15, 30, 60]
const REMIND_OPTIONS = [0, 1, 5, 10, 30]
const URGENT_SECONDS = 5 * 60

function askNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

export default function CountdownPage() {
  const { t } = useTranslation()
  const items = useCountdownStore((s) => s.items)
  const barHidden = useCountdownStore((s) => s.barHidden)
  const add = useCountdownStore((s) => s.add)
  const update = useCountdownStore((s) => s.update)
  const remove = useCountdownStore((s) => s.remove)
  const clearFinished = useCountdownStore((s) => s.clearFinished)
  const setBarHidden = useCountdownStore((s) => s.setBarHidden)

  // Page-local ticking clock for the remaining column (the store never ticks).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const [formRemind, setFormRemind] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const nowMs = now.getTime()
  // Active countdowns first (soonest on top), finished ones after (latest first).
  const sorted = [...items].sort((a, b) => {
    const at = new Date(a.target).getTime()
    const bt = new Date(b.target).getTime()
    const aPast = at <= nowMs
    const bPast = bt <= nowMs
    if (aPast !== bPast) return aPast ? 1 : -1
    return aPast ? bt - at : at - bt
  })
  const finishedCount = items.filter((it) => new Date(it.target).getTime() <= nowMs).length

  const openAdd = () => {
    setEditingId(null)
    setFormLabel('')
    setFormTarget(toLocalInputValue(new Date(now.getTime() + 30 * 60_000)))
    setFormRemind(0)
    setDialogOpen(true)
  }

  const openEdit = (id: string) => {
    const it = items.find((x) => x.id === id)
    if (!it) return
    setEditingId(id)
    setFormLabel(it.label)
    setFormTarget(isoToLocalInput(it.target))
    setFormRemind(it.remindBeforeMin)
    setDialogOpen(true)
  }

  const handleSave = () => {
    const label = formLabel.trim()
    if (!label) {
      toast.error(t('countdown.labelRequired'))
      return
    }
    if (!formTarget) {
      toast.error(t('countdown.targetRequired'))
      return
    }
    const targetMs = new Date(formTarget).getTime()
    if (Number.isNaN(targetMs)) {
      toast.error(t('countdown.targetRequired'))
      return
    }
    if (targetMs <= now.getTime()) {
      toast.error(t('countdown.targetPast'))
      return
    }
    askNotificationPermission()
    if (editingId) {
      update(editingId, { label, target: new Date(targetMs).toISOString(), remindBeforeMin: formRemind })
    } else {
      add({ label, target: new Date(targetMs).toISOString(), remindBeforeMin: formRemind })
      toast.success(t('countdown.createdToast'))
    }
    setDialogOpen(false)
  }

  const handleQuickAdd = (min: number) => {
    askNotificationPermission()
    add({ label: t('countdown.defaultLabel', { n: min }), target: new Date(now.getTime() + min * 60_000).toISOString() })
    toast.success(t('countdown.createdToast'))
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('countdown.title')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setBarHidden(!barHidden)}>
              {barHidden ? <Eye className="mr-1.5 h-4 w-4" /> : <EyeOff className="mr-1.5 h-4 w-4" />}
              {barHidden ? t('countdown.showBar') : t('countdown.hideBar')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => clearFinished()} disabled={finishedCount === 0}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              {t('countdown.clearFinished')}
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t('countdown.add')}
            </Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-sm font-medium">{t('countdown.quickStart')}</span>
        {QUICK_MINUTES.map((min) => (
          <Button key={min} variant="secondary" size="sm" onClick={() => handleQuickAdd(min)}>
            <Hourglass className="mr-1 h-3.5 w-3.5" />
            {t('countdown.minutesShort', { n: min })}
          </Button>
        ))}
      </Card>

      {sorted.length === 0 ? (
        <EmptyState message={t('countdown.empty')} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('countdown.label')}</TableHead>
                <TableHead>{t('countdown.targetTime')}</TableHead>
                <TableHead>{t('countdown.remaining')}</TableHead>
                <TableHead>{t('countdown.remindBefore')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((it) => {
                const sec = remainingSeconds(it.target, now)
                const finished = sec <= 0
                const urgent = !finished && sec <= URGENT_SECONDS
                return (
                  <TableRow key={it.id}>
                    <TableCell className="max-w-[240px] truncate font-medium">{it.label}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(it.target).toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {finished ? (
                        <Badge variant="secondary">{t('countdown.finished')}</Badge>
                      ) : (
                        <span className={cn('font-semibold tabular-nums', urgent && 'text-rose-500')}>
                          {formatCountdown(sec, t)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {it.remindBeforeMin > 0 ? t('countdown.remindBeforeMin', { n: it.remindBeforeMin }) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(it.id)} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(it.id)} aria-label={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t('countdown.edit') : t('countdown.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="cd-label" className="text-sm font-medium">{t('countdown.label')}</label>
              <input
                id="cd-label"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={t('countdown.labelPlaceholder')}
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cd-target" className="text-sm font-medium">{t('countdown.targetTime')}</label>
              <input
                id="cd-target"
                type="datetime-local"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {QUICK_MINUTES.map((min) => (
                  <Button
                    key={min}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setFormTarget(toLocalInputValue(new Date(now.getTime() + min * 60_000)))}
                  >
                    +{t('countdown.minutesShort', { n: min })}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('countdown.remindBefore')}</label>
              <div role="group" className="mt-1 flex flex-wrap gap-2">
                {REMIND_OPTIONS.map((min) => (
                  <Button
                    key={min}
                    type="button"
                    size="sm"
                    variant={formRemind === min ? 'default' : 'outline'}
                    onClick={() => setFormRemind(min)}
                  >
                    {min === 0 ? t('countdown.remindBeforeOff') : t('countdown.remindBeforeMin', { n: min })}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={t('common.delete')}
        message={t('countdown.deleteConfirm')}
        confirmText={t('common.delete')}
        onConfirm={() => {
          if (deleteTarget !== null) remove(deleteTarget)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
