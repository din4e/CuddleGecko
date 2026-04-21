import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { remindersApi } from '../api/reminders'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import type { Reminder, ReminderStatus } from '../types'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import { CheckCircle, Clock, AlertCircle, Trash2, Pencil } from 'lucide-react'

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

  // Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formRemindAt, setFormRemindAt] = useState('')
  const [formStatus, setFormStatus] = useState<ReminderStatus>('pending')

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

  const openEdit = (r: Reminder) => {
    setEditing(r)
    setFormTitle(r.title)
    setFormDesc(r.description || '')
    setFormRemindAt(r.remind_at ? r.remind_at.slice(0, 16) : '')
    setFormStatus(r.status)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!editing) return
    await remindersApi.update(editing.id, {
      title: formTitle,
      description: formDesc,
      remind_at: formRemindAt,
      status: formStatus,
    })
    setDialogOpen(false)
    loadReminders()
  }

  const handleStatusChange = async (id: number, status: ReminderStatus) => {
    await remindersApi.update(id, { status })
    loadReminders()
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('reminders.deleteConfirm'))) {
      await remindersApi.delete(id)
      loadReminders()
    }
  }

  const renderActions = (r: Reminder) => (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)} aria-label={t('reminders.edit')}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)} aria-label={t('reminders.delete')}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

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
                <TableHead>{t('reminders.title_field')}</TableHead>
                <TableHead>{t('reminders.description')}</TableHead>
                <TableHead>{t('reminders.time')}</TableHead>
                <TableHead>{t('reminders.status_label')}</TableHead>
                <TableHead className="text-right">{t('reminders.actions')}</TableHead>
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
                    <TableCell>
                      <Badge
                        variant={cfg.variant}
                        className="cursor-pointer select-none"
                        onClick={() => {
                          const next: Record<ReminderStatus, ReminderStatus> = { pending: 'done', done: 'snoozed', snoozed: 'pending' }
                          handleStatusChange(r.id, next[r.status])
                        }}
                      >
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{renderActions(r)}</TableCell>
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
                    <Badge
                      variant={cfg.variant}
                      className="cursor-pointer select-none text-xs"
                      onClick={() => {
                        const next: Record<ReminderStatus, ReminderStatus> = { pending: 'done', done: 'snoozed', snoozed: 'pending' }
                        handleStatusChange(r.id, next[r.status])
                      }}
                    >
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="flex gap-1 pt-1">
                    {renderActions(r)}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('reminders.editReminder')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="rem-title" className="text-sm font-medium">{t('reminders.title_field')}</label>
              <input id="rem-title" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="rem-desc" className="text-sm font-medium">{t('reminders.description')}</label>
              <textarea id="rem-desc" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={3} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div>
              <label htmlFor="rem-time" className="text-sm font-medium">{t('reminders.time')}</label>
              <input id="rem-time" type="datetime-local" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={formRemindAt} onChange={(e) => setFormRemindAt(e.target.value)} />
            </div>
            <div>
              <label htmlFor="rem-status" className="text-sm font-medium">{t('reminders.status_label')}</label>
              <div id="rem-status" role="group" className="mt-1 flex gap-2">
                {(['pending', 'done', 'snoozed'] as ReminderStatus[]).map((s) => (
                  <Button key={s} size="sm" variant={formStatus === s ? 'default' : 'outline'} onClick={() => setFormStatus(s)}>
                    {statusLabels[s]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('reminders.cancel')}</Button>
            <Button onClick={handleSave}>{t('reminders.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
