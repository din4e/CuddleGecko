import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { remindersApi } from '../api/reminders'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import type { Reminder, ReminderStatus } from '../types'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import { CheckCircle, Clock, AlertCircle, Trash2 } from 'lucide-react'

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
  const [view, setView] = useViewMode('reminders')

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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('reminders.title')}</h1>
        <ViewToggle value={view} onChange={setView} />
      </div>
      <div className="flex gap-2">
        {['', 'pending', 'done', 'snoozed'].map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s as ReminderStatus | '')}>
            {s === '' ? t('reminders.all') : statusLabels[s as keyof typeof statusLabels] || s}
          </Button>
        ))}
      </div>
      {loading ? <div>{t('reminders.loading')}</div> : reminders.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('reminders.noReminders')}</p>
      ) : view === 'list' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminders.map((r) => {
                const cfg = statusConfig[r.status] || statusConfig.pending
                const Icon = cfg.icon
                return (
                  <TableRow key={r.id}>
                    <TableCell><Icon className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{r.description || '—'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(r.remind_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === 'pending' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleMarkDone(r.id)}>{t('reminders.markDone')}</Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reminders.map((r) => {
            const cfg = statusConfig[r.status] || statusConfig.pending
            const Icon = cfg.icon
            return (
              <Card key={r.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium truncate">{r.title}</span>
                  </div>
                  {r.description && <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{new Date(r.remind_at).toLocaleString()}</span>
                    <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                  </div>
                  <div className="flex gap-1 pt-1">
                    {r.status === 'pending' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleMarkDone(r.id)}>{t('reminders.markDone')}</Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleDelete(r.id)}>{t('reminders.delete')}</Button>
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
