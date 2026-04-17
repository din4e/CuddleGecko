import { useEffect, useState } from 'react'
import { remindersApi } from '../api/reminders'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import type { Reminder, ReminderStatus } from '../types'
import { CheckCircle, Clock, AlertCircle } from 'lucide-react'

const statusConfig: Record<string, { icon: typeof Clock; label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  pending: { icon: Clock, label: 'Pending', variant: 'default' },
  done: { icon: CheckCircle, label: 'Done', variant: 'secondary' },
  snoozed: { icon: AlertCircle, label: 'Snoozed', variant: 'outline' },
}

export default function RemindersPage() {
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
    if (confirm('Delete this reminder?')) {
      await remindersApi.delete(id)
      loadReminders()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reminders</h1>
      <div className="flex gap-2">
        {['', 'pending', 'done', 'snoozed'].map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s as ReminderStatus | '')}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      {loading ? <div>Loading...</div> : reminders.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No reminders found</p>
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
                      <Button size="sm" variant="outline" onClick={() => handleMarkDone(r.id)}>Done</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>Delete</Button>
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
