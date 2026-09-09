import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { useTodosList } from '../hooks/api/useTodos'
import { useEventsList } from '../hooks/api/useEvents'
import { useHabitsList } from '../hooks/api/useHabits'
import { useCreateWorkout } from '../hooks/api/useWorkouts'

// One normalized picker row per importable item, whatever module it came from.
interface ImportCandidate {
  key: string // '<source>-<id>' — stable React key
  source: 'todo' | 'event' | 'habit'
  title: string
  scheduledAt?: string | null
}

const sourceBadgeCls: Record<ImportCandidate['source'], string> = {
  todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  event: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  habit: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

/**
 * ImportPlansDialog pulls plans from the other modules (pending todos, events,
 * active habits) and creates a planned workout from each selected item. It is
 * a one-way copy: the source items are left untouched.
 */
export function ImportPlansDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const createWorkout = useCreateWorkout()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: todosPage, isLoading: todosLoading } = useTodosList({ status: 'pending', page_size: 100 })
  const { data: eventsPage, isLoading: eventsLoading } = useEventsList({ page_size: 100 })
  const { data: habits, isLoading: habitsLoading } = useHabitsList(false)

  const candidates = useMemo<ImportCandidate[]>(() => {
    const list: ImportCandidate[] = []
    for (const td of todosPage?.items ?? []) {
      list.push({ key: `todo-${td.id}`, source: 'todo', title: td.title, scheduledAt: td.due_time })
    }
    for (const ev of eventsPage?.items ?? []) {
      list.push({ key: `event-${ev.id}`, source: 'event', title: ev.title, scheduledAt: ev.start_time })
    }
    for (const hb of habits ?? []) {
      if (hb.archived) continue
      list.push({ key: `habit-${hb.id}`, source: 'habit', title: hb.name, scheduledAt: null })
    }
    return list
  }, [todosPage, eventsPage, habits])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((c) => c.title.toLowerCase().includes(needle))
  }, [candidates, q])

  const loading = todosLoading || eventsLoading || habitsLoading
  const pending = createWorkout.isPending

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleImport = async () => {
    const picked = candidates.filter((c) => selected.has(c.key))
    await Promise.all(picked.map((c) =>
      createWorkout.mutateAsync({
        name: c.title,
        type: 'other',
        status: 'planned',
        scheduled_at: c.scheduledAt ?? undefined,
      }),
    ))
    onClose()
  }

  const fmtTime = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fitness.importPlansTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('fitness.importPlansHint')}</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fitness.importSearchPlaceholder')} />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
          {!loading && filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('fitness.importNoItems')}</p>}
          {filtered.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={selected.has(c.key)}
                onChange={() => toggle(c.key)}
                className="h-4 w-4 shrink-0 accent-primary"
                aria-label={c.title}
              />
              <Badge variant="secondary" className={`shrink-0 ${sourceBadgeCls[c.source]}`}>
                {t(`fitness.importSource${cap(c.source)}`)}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
              {c.scheduledAt && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />{fmtTime(c.scheduledAt)}
                </span>
              )}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t('common.cancel')}</Button>
          <Button onClick={handleImport} disabled={pending || selected.size === 0}>
            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('fitness.importSelected', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
