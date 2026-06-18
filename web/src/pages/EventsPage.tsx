import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { CalendarDays, Clock, MapPin, Plus, Pencil, Trash2, Heart, Sparkles, Loader2 } from 'lucide-react'
import BuddyPicker from '../components/BuddyPicker'
import { ConfirmDialog } from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import EmptyState from '../components/EmptyState'
import ListPageHeader from '../components/ListPageHeader'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import { useModeStore } from '../stores/mode'
import type { Event, Contact } from '../types'
import {
  useEventsList,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from '../hooks/api/useEvents'

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

function getDateRange(filter: TimeFilter): { start_after?: string; end_before?: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (filter) {
    case 'today': {
      const end = new Date(today)
      end.setDate(end.getDate() + 1)
      return { start_after: today.toISOString(), end_before: end.toISOString() }
    }
    case 'thisWeek': {
      const start = new Date(today)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return { start_after: start.toISOString(), end_before: end.toISOString() }
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { start_after: start.toISOString(), end_before: end.toISOString() }
    }
    case 'upcoming':
      return { start_after: now.toISOString() }
    case 'past':
      return { end_before: now.toISOString() }
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
  const [buddies, setBuddies] = useState<Contact[]>([])
  const [filter, setFilter] = useState<TimeFilter>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)
  const [form, setForm] = useState<EventFormData>(emptyForm)
  const [view, setView] = useViewMode('events')
  const adapters = useModeStore((s) => s.adapters)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [analyzingId, setAnalyzingId] = useState<number | null>(null)
  const [aiAvailable, setAiAvailable] = useState(false)

  const range = getDateRange(filter)
  const { data, isPending } = useEventsList({
    page,
    page_size: pageSize,
    start_after: range.start_after,
    end_before: range.end_before,
  })
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const deleteEvent = useDeleteEvent()

  const events = data?.items ?? []
  const total = data?.total ?? 0

  const handleAnalyzeEvent = async (eventId: number) => {
    if (!adapters?.ai) return
    setAnalyzingId(eventId)
    setAnalysisResult(null)
    try {
      const res = await adapters.ai.analyzeEvent(eventId)
      setAnalysisResult(res.analysis)
    } catch {
      setAnalysisResult(t('ai.sendFailed'))
    } finally {
      setAnalyzingId(null)
    }
  }

  const filterKeys: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: t('events.all') },
    { key: 'today', label: t('events.today') },
    { key: 'thisWeek', label: t('events.thisWeek') },
    { key: 'thisMonth', label: t('events.thisMonth') },
    { key: 'upcoming', label: t('events.upcoming') },
    { key: 'past', label: t('events.past') },
  ]

  useEffect(() => {
    contactsApi.list({ page: 1, page_size: 200 }).then((res) => setBuddies(res.data.items || []))
    adapters?.ai?.listProviders().then((providers) => {
      setAiAvailable(providers?.some((p) => p.is_active) ?? false)
    }).catch(() => setAiAvailable(false))
  }, [adapters?.ai])

  const changeFilter = (f: TimeFilter) => {
    setFilter(f)
    setPage(1)
  }

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
      await updateEvent.mutateAsync({ id: editing.id, data: payload })
    } else {
      await createEvent.mutateAsync(payload)
    }

    setDialogOpen(false)
  }

  const handleConfirmDelete = async () => {
    if (deleteTarget === null) return
    await deleteEvent.mutateAsync(deleteTarget)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('events.title')}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('events.newEvent')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {filterKeys.map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => changeFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isPending ? (
        <div>{t('events.loading')}</div>
      ) : events.length === 0 ? (
        <EmptyState message={t('events.noEvents')} />
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
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden="true" />{formatDate(e.start_time)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{formatTime(e.start_time)}{e.end_time && ` — ${formatTime(e.end_time)}`}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.location ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{e.location}</span> : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.contact_ids?.length > 0 ? (
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden="true" />{e.contact_ids.map((cid) => buddies.find((b) => b.id === cid)?.name).filter(Boolean).join(', ')}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {aiAvailable && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAnalyzeEvent(e.id)} disabled={analyzingId === e.id} title={t('ai.analyzeEvent')} aria-label={t('ai.analyzeEvent')}>
                        {analyzingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)} aria-label={t('events.editEvent')}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(e.id)} aria-label={t('events.deleteEvent')}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <Card key={e.id} className="flex flex-col overflow-hidden">
              {e.color && (
                <div className="h-1 shrink-0" style={{ backgroundColor: e.color }} />
              )}
              <CardContent className="flex-1 pt-4 space-y-2">
                <div className="font-medium">{e.title}</div>
                {e.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{e.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                    {formatDate(e.start_time)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatTime(e.start_time)}
                  </span>
                  {e.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {e.location}
                    </span>
                  )}
                </div>
                {e.contact_ids?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3 w-3" aria-hidden="true" />
                    {e.contact_ids.map((cid) => buddies.find((b) => b.id === cid)?.name).filter(Boolean).join(', ')}
                  </div>
                )}
                <div className="flex gap-1 pt-1">
                  {aiAvailable && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAnalyzeEvent(e.id)} disabled={analyzingId === e.id} title={t('ai.analyzeEvent')} aria-label={t('ai.analyzeEvent')}>
                    {analyzingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)} aria-label={t('events.editEvent')}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(e.id)} aria-label={t('events.deleteEvent')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('events.editEvent') : t('events.newEvent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-title">{t('events.title_field')}</Label>
              <Input id="event-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-description">{t('events.description')}</Label>
              <Textarea id="event-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event-start">{t('events.startTime')}</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">{t('events.endTime')}</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-location">{t('events.location')}</Label>
              <Input id="event-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('events.color')}</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-[border-color,transform] ${
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
            <Button onClick={handleSubmit} disabled={!form.title || !form.start_time || createEvent.isPending || updateEvent.isPending}>
              {editing ? t('events.editEvent') : t('events.newEvent')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!analysisResult} onOpenChange={() => setAnalysisResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t('ai.analysisTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm max-h-[60vh] overflow-auto">{analysisResult}</div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={t('events.deleteEvent')}
        message={t('events.deleteConfirm')}
        confirmText={t('events.deleteEvent')}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
