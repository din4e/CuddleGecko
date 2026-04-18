import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { remindersApi } from '../api/reminders'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import type { Reminder, ReminderStatus } from '../types'
import { CheckCircle, Clock, AlertCircle } from 'lucide-react'

export default function RemindersPage() {
  const { t } = useTranslation()
  const statusLabels = { pending: t('reminders.pending'), done: t('reminders.done'), snoozed: t('reminders.snoozed') }
  const statusConfig: Record<string, { icon: typeof Clock; label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    pending: { icon: Clock, label: statusLabels.pending, variant: 'default' },
    done: { icon: CheckCircle, label: statusLabels.done, variant: 'secondary' },
    snoozed: { icon: AlertCircle, label: statusLabels.snoozed, variant: 'outline' },
  }
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | ''>('')
  const [loading, setLoading] = useState(true)

  const loadReminders = async () => {
    setLoading(true)
    try {
      const res = await remindersApi.list(statusFilter || undefined)
      const remindersData = res.data
      setReminders(Array.isArray(remindersData) ? remindersData : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReminders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const handleMarkDone = async (id: number) => {
    await remindersApi.update(id, { status: 'done' } as Partial<Reminder>)
    loadReminders()
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('reminders.deleteConfirm'))) {
      await remindersApi.delete(id)
      loadReminders()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('reminders.title')}</h1>
      <div className="flex gap-2">
        {['', 'pending', 'done', 'snoozed'].map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s as ReminderStatus | '')}>
            {s === '' ? t('reminders.all') : statusLabels[s as keyof typeof statusLabels] || s}
          </Button>
        ))}
      </div>
      {loading ? <div>{t('reminders.loading')}</div> : reminders.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('reminders.noReminders')}</p>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => {
            const cfg = statusConfig[r.status] || statusConfig.pending
            const Icon = cfg.icon
            return (
              <Card key={r.id}>
                <CardContent className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{r.title}</div>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                      <div className="text-xs text-muted-foreground mt-1">{new Date(r.remind_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {r.status === 'pending' && (
                      <Button size="sm" variant="outline" onClick={() => handleMarkDone(r.id)}>{t('reminders.markDone')}</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>{t('reminders.delete')}</Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
