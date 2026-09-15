import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { useContactsList } from '../../hooks/api/useContacts'
import { useTodosList } from '../../hooks/api/useTodos'
import { useEventsList } from '../../hooks/api/useEvents'
import { useWorkoutsList } from '../../hooks/api/useWorkouts'
import { useTransactionsList } from '../../hooks/api/useTransactions'
import type { WhiteboardNodeInput, WhiteboardRefType } from '../../types'

type Kind = 'contact' | 'todo' | 'event' | 'workout' | 'transaction' | 'note'

const KINDS: Kind[] = ['contact', 'todo', 'event', 'workout', 'transaction', 'note']

/**
 * AddNodeDialog picks an existing entity (any module) or writes a free-text
 * card and drops it onto the canvas at the requested position.
 */
export function AddNodeDialog({ open, at, onClose, onAdd }: {
  open: boolean
  at: { x: number; y: number }
  onClose: () => void
  onAdd: (node: WhiteboardNodeInput) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>('note')
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  // Entity lists reuse the shared cached hooks — 100 items each is plenty for
  // a picker.
  const { data: contacts } = useContactsList({ search: q, page_size: 100 })
  const { data: todos } = useTodosList({ q, page_size: 100 })
  const { data: events } = useEventsList({ q, page_size: 100 })
  const { data: workouts } = useWorkoutsList({ q, page_size: 100 })
  const { data: txs } = useTransactionsList({ q, page_size: 100 })

  const items = useMemo(() => {
    switch (kind) {
      case 'contact': return (contacts?.items ?? []).map((c) => ({ id: c.id, label: c.name, detail: [c.nickname, ...(c.tags ?? []).map((t) => t.name)].filter(Boolean).join(' · ') }))
      case 'todo': return (todos?.items ?? []).map((x) => ({ id: x.id, label: x.title, detail: '' }))
      case 'event': return (events?.items ?? []).map((x) => ({ id: x.id, label: x.title, detail: '' }))
      case 'workout': return (workouts?.items ?? []).map((x) => ({ id: x.id, label: x.name, detail: '' }))
      case 'transaction': return (txs?.items ?? []).map((x) => ({ id: x.id, label: x.title, detail: String(x.amount) }))
      default: return []
    }
  }, [kind, contacts, todos, events, workouts, txs])

  const busy = contacts === undefined && kind === 'contact' // loading state

  const addEntity = async (id: number, label: string) => {
    setAdding(true)
    try {
      await onAdd({ ref_type: kind as WhiteboardRefType, ref_id: id, label, x: at.x, y: at.y })
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const addNote = async () => {
    if (!label.trim()) return
    setAdding(true)
    try {
      await onAdd({ ref_type: 'note', label: label.trim(), note, x: at.x, y: at.y })
      setLabel(''); setNote('')
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const cls = 'h-8 rounded-md border bg-background px-2 text-xs'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('whiteboard.addNode')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-2.5 py-1 text-xs ${kind === k ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground'}`}
            >
              {t(`whiteboard.kind_${k}`)}
            </button>
          ))}
        </div>
        {kind === 'note' ? (
          <div className="space-y-2">
            <Input placeholder={t('whiteboard.noteTitle')} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={300} />
            <Textarea placeholder={t('whiteboard.noteBody')} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <Button size="sm" onClick={addNote} disabled={!label.trim() || adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('whiteboard.add')}
            </Button>
          </div>
        ) : (
          <>
            <Input className={cls} placeholder={t('common.search') || ''} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-64 overflow-y-auto">
              {busy && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
              {!busy && items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t('common.none') || '—'}</p>}
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  disabled={adding}
                  onClick={() => addEntity(it.id, it.label)}
                  className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.detail && <span className="shrink-0 text-xs text-muted-foreground">{it.detail}</span>}
                </button>
              ))}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
