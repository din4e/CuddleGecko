import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { eventApi } from '../api/event'
import { contactsApi } from '../api/contacts'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { CalendarDays, Clock, MapPin, Plus, Pencil, Trash2, Heart } from 'lucide-react'
import BuddyPicker from '../components/BuddyPicker'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import type { Event, Contact } from '../types'

type TimeFilter = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'upcoming' | 'past'

const COLORS = [
  { value: '', label: 'Default' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
]

function getDateRange(filter: TimeFilter): { startAfter?: string; endBefore?: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (filter) {
    case 'today': {
      const end = new Date(today)
      end.setDate(end.getDate() + 1)
      return { startAfter: today.toISOString(), endBefore: end.toISOString() }
    }
    case 'thisWeek': {
      const start = new Date(today)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return { startAfter: start.toISOString(), endBefore: end.toISOString() }
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { startAfter: start.toISOString(), endBefore: end.toISOString() }
    }
    case 'upcoming':
      return { startAfter: now.toISOString() }
    case 'past':
      return { endBefore: now.toISOString() }
    default:
      return {}
  }
}

function formatDate(d: string) {
  const date = new Date(d)
  const today = new Date()
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = (eventDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)

  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'

  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

interface EventFormData {
  title: string
  description: string
  start_time: string
  end_time: string
  location: string
  color: string
  contact_ids: number[]
}

const emptyForm: EventFormData = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  location: '',
  color: '',
  contact_ids: [],
}

export default function EventsPage() {
  const { t } = useTranslation()
  const [events, setEvents] = useState<Event[]>([])
  const [buddies, setBuddies] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TimeFilter>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)
  const [form, setForm] = useState<EventFormData>(emptyForm)
  const [view, setView] = useViewMode('events')

  const filterKeys: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: t('events.all') },
    { key: 'today', label: t('events.today') },
    { key: 'thisWeek', label: t('events.thisWeek') },
    { key: 'thisMonth', label: t('events.thisMonth') },
    { key: 'upcoming', label: t('events.upcoming') },
    { key: 'past', label: t('events.past') },
  ]

  const loadEvents = async () => {
    setLoading(true)
    try {
      const range = getDateRange(filter)
      const res = await eventApi.list({ page: 1, page_size: 100, ...range })
      const data = res.data
      setEvents(Array.isArray(data?.items) ? data.items : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    contactsApi.list({ page: 1, page_size: 200 }).then((res) => setBuddies(res.data.items || []))
  }, [])

  useEffect(() => {
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (e: Event) => {
    setEditing(e)
    setForm({
      title: e.title,
      description: e.description || '',
      start_time: e.start_time ? new Date(e.start_time).toISOString().slice(0, 16) : '',
      end_time: e.end_time ? new Date(e.end_time).toISOString().slice(0, 16) : '',
      location: e.location || '',
      color: e.color || '',
      contact_ids: e.contact_ids || [],
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      start_time: form.start_time ? new Date(form.start_time).toISOString() : undefined,
      end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
      location: form.location,
      color: form.color,
      contact_ids: form.contact_ids,
    }

    if (editing) {
      await eventApi.update(editing.id, payload)
    } else {
      await eventApi.create(payload)
    }

    setDialogOpen(false)
    loadEvents()
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('events.deleteConfirm'))) {
      await eventApi.delete(id)
      loadEvents()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('events.title')}</h1>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('events.newEvent')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterKeys.map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div>{t('events.loading')}</div>
      ) : events.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('events.noEvents')}</p>
      ) : view === 'list' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-4"></TableHead>
                <TableHead>{t('events.title_field')}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>{t('events.location')}</TableHead>
                <TableHead>Buddies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.color && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: e.color }} />}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{e.title}</div>
                      {e.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{e.description}</div>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(e.start_time)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(e.start_time)}{e.end_time && ` — ${formatTime(e.end_time)}`}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.location ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span> : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.contact_ids?.length > 0 ? (
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{e.contact_ids.map((cid) => buddies.find((b) => b.id === cid)?.name).filter(Boolean).join(', ')}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Card key={e.id} className="overflow-hidden">
              {e.color && (
                <div className="h-1" style={{ backgroundColor: e.color }} />
              )}
              <CardContent className="pt-4 space-y-2">
                <div className="font-medium">{e.title}</div>
                {e.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{e.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(e.start_time)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(e.start_time)}
                  </span>
                  {e.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {e.location}
                    </span>
                  )}
                </div>
                {e.contact_ids?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3 w-3" />
                    {e.contact_ids.map((cid) => buddies.find((b) => b.id === cid)?.name).filter(Boolean).join(', ')}
                  </div>
                )}
                <div className="flex gap-1 pt-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(e.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('events.editEvent') : t('events.newEvent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('events.title_field')}</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('events.description')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('events.startTime')}</Label>
                <Input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('events.endTime')}</Label>
                <Input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('events.location')}</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('events.color')}</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      form.color === c.value ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.value || 'hsl(var(--muted))' }}
                    onClick={() => setForm({ ...form, color: c.value })}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Buddies</Label>
              <BuddyPicker
                buddies={buddies}
                selectedIds={form.contact_ids}
                onChange={(ids) => setForm({ ...form, contact_ids: ids })}
                onBuddiesUpdate={setBuddies}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!form.title || !form.start_time}>
              {editing ? t('events.editEvent') : t('events.newEvent')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
