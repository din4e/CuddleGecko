import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog'
import { Plus, Pencil, Trash2, Flame, CheckCircle2, Loader2, Trophy, TrendingUp } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { toast } from 'sonner'
import type { Habit } from '../types'
import {
  useHabitsList, useCreateHabit, useUpdateHabit, useDeleteHabit, useCheckinHabit,
} from '../hooks/api/useHabits'

const COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

function lastNDates(n: number): string[] {
  const out: string[] = []
  const t = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t)
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export default function HabitsPage() {
  const { t } = useTranslation()
  const [archived, setArchived] = useState(false)
  const { data: habits, isPending: loading } = useHabitsList(archived)
  const createHabit = useCreateHabit()
  const updateHabit = useUpdateHabit()
  const deleteHabit = useDeleteHabit()
  const checkin = useCheckinHabit()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmoji, setFormEmoji] = useState('✅')
  const [formColor, setFormColor] = useState('')

  const days = useMemo(() => lastNDates(35), [])

  const openCreate = () => { setEditing(null); setFormName(''); setFormEmoji('✅'); setFormColor(''); setDialogOpen(true) }
  const openEdit = (h: Habit) => { setEditing(h); setFormName(h.name); setFormEmoji(h.emoji || '✅'); setFormColor(h.color || ''); setDialogOpen(true) }

  const handleSave = async () => {
    if (!formName.trim()) return
    const payload = { name: formName.trim(), emoji: formEmoji, color: formColor }
    if (editing) await updateHabit.mutateAsync({ id: editing.id, data: payload })
    else await createHabit.mutateAsync(payload)
    setDialogOpen(false)
  }

  const list = habits ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('habits.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant={archived ? 'default' : 'ghost'} size="sm" onClick={() => setArchived((v) => !v)}>
            {t('habits.archived')}
          </Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />{t('habits.new')}</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <EmptyState message={t('habits.empty')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((h) => {
            const set = new Set(h.recent || [])
            return (
              <Card key={h.id} className={h.archived ? 'opacity-60' : ''} style={h.color ? { borderLeftColor: h.color, borderLeftWidth: '3px' } : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => checkin.mutate({ id: h.id })}
                      disabled={h.archived}
                      className="shrink-0 bg-transparent border-none cursor-pointer disabled:opacity-50"
                      title={t('habits.checkin')}
                    >
                      {h.today_done
                        ? <CheckCircle2 className="h-8 w-8" style={{ color: h.color || '#22c55e' }} />
                        : <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 hover:text-muted-foreground" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{h.emoji || '✅'}</span>
                        <span className="font-medium truncate">{h.name}</span>
                        {h.today_done && <Flame className="h-3.5 w-3.5 text-orange-500" />}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5"><Flame className="h-3 w-3 text-orange-500" />{t('habits.streak')}: <b className="text-foreground">{h.streak}</b></span>
                        <span className="inline-flex items-center gap-0.5"><Trophy className="h-3 w-3" />{t('habits.best')}: <b className="text-foreground">{h.best}</b></span>
                        <span className="inline-flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{t('habits.rate30')}: <b className="text-foreground">{Math.round(h.rate_30 * 100)}%</b></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(h)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setConfirmDelete(h)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>

                  {/* 35-day heatmap */}
                  <div className="grid grid-cols-7 gap-1">
                    {days.map((d) => {
                      const done = set.has(d)
                      const isToday = d === days[days.length - 1]
                      return (
                        <div
                          key={d}
                          title={`${d}${done ? ' ✓' : ''}`}
                          className={`aspect-square rounded-sm ${done ? '' : 'bg-muted/60'} ${isToday ? 'ring-1 ring-primary' : ''}`}
                          style={done ? { backgroundColor: h.color || '#22c55e' } : undefined}
                        />
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={(o) => setDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? t('habits.edit') : t('habits.new')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('habits.name')} *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('habits.emoji')}</Label>
                <Input value={formEmoji} onChange={(e) => setFormEmoji(e.target.value.slice(0, 4))} className="text-center text-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('habits.color')}</Label>
                <div className="flex flex-wrap gap-1">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setFormColor(c)}
                      className={`h-6 w-6 rounded-full border-2 ${formColor === c ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}
                      style={{ backgroundColor: c || 'transparent', backgroundImage: c ? 'none' : 'linear-gradient(135deg,#667eea,#764ba2)' }} />
                  ))}
                </div>
              </div>
            </div>
            {editing && (
              <Button variant="outline" size="sm" onClick={async () => {
                await updateHabit.mutateAsync({ id: editing.id, data: { archived: !editing.archived } })
                setDialogOpen(false)
              }}>
                {editing.archived ? t('habits.unarchive') : t('habits.archive')}
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || createHabit.isPending || updateHabit.isPending}>
              {(createHabit.isPending || updateHabit.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('habits.deleteConfirm')}</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={async () => {
              if (confirmDelete) { await deleteHabit.mutateAsync(confirmDelete.id); setConfirmDelete(null); toast.success(t('habits.deleted')) }
            }}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
