import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useContactsList } from '../hooks/api/useContacts'
import { rootKey } from '../hooks/api/keys'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
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
import { TrendingUp, TrendingDown, Wallet, Plus, Pencil, Trash2, Heart } from 'lucide-react'
import BuddyPicker from '../components/BuddyPicker'
import { ConfirmDialog } from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import EmptyState from '../components/EmptyState'
import { ListSkeleton } from '../components/ListSkeleton'
import ListPageHeader from '../components/ListPageHeader'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import type { Transaction } from '../types'
import {
  useTransactionsList,
  useTransactionsSummary,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
} from '../hooks/api/useTransactions'

type TxType = '' | 'income' | 'expense'

interface TxFormData {
  title: string
  amount: string
  type: 'income' | 'expense'
  category: string
  date: string
  notes: string
  contact_ids: number[]
}

const emptyForm: TxFormData = {
  title: '',
  amount: '',
  type: 'expense',
  category: '',
  date: '',
  notes: '',
  contact_ids: [],
}

export default function FinancePage() {
  const { t } = useTranslation()
  // Buddies come from the shared React-Query cache (30s staleTime) instead of a
  // raw per-mount fetch — navigating between pages no longer re-pulls the list.
  const qc = useQueryClient()
  const { data: buddiesData } = useContactsList({ page: 1, page_size: 200 })
  const buddies = useMemo(() => buddiesData?.items ?? [], [buddiesData])
  // O(1) id→name lookup so rendering N transaction rows doesn't run a
  // buddies.find() per contact id per row (was O(rows × buddies)).
  const buddyNameById = useMemo(() => new Map(buddies.map((b) => [b.id, b.name])), [buddies])
  const [typeFilter, setTypeFilter] = useState<TxType>('')
  const [q, setQ] = useState('')
  // Debounce the search: input stays responsive on `q`, list query refires only
  // once typing settles (matches the FitnessPage pattern).
  const deferredQ = useDeferredValue(q)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState<TxFormData>(emptyForm)
  const [view, setView] = useViewMode('finance')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const { data, isPending } = useTransactionsList({
    page,
    page_size: pageSize,
    type: typeFilter || undefined,
    q: deferredQ || undefined,
  })
  const { data: summary } = useTransactionsSummary()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()

  const transactions = data?.items ?? []
  const total = data?.total ?? 0

  const changeTypeFilter = (ty: TxType) => {
    setTypeFilter(ty)
    setPage(1)
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setEditing(tx)
    setForm({
      title: tx.title,
      amount: String(tx.amount),
      type: tx.type,
      category: tx.category || '',
      date: tx.date ? new Date(tx.date).toISOString().slice(0, 10) : '',
      notes: tx.notes || '',
      contact_ids: tx.contact_ids || [],
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('finance.invalidAmount'))
      return
    }
    const payload: Record<string, unknown> = {
      title: form.title,
      amount,
      type: form.type,
      category: form.category,
      date: form.date ? new Date(form.date).toISOString() : undefined,
      notes: form.notes,
      contact_ids: form.contact_ids,
    }

    if (editing) {
      await updateTx.mutateAsync({ id: editing.id, data: payload })
    } else {
      await createTx.mutateAsync(payload)
    }

    setDialogOpen(false)
  }

  const handleConfirmDelete = async () => {
    if (deleteTarget === null) return
    await deleteTx.mutateAsync(deleteTarget)
    setDeleteTarget(null)
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('finance.title')}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('finance.newTransaction')}
            </Button>
          </>
        }
      />

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="flex flex-col shadow-sm">
            <CardContent className="flex-1 pt-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">{t('finance.totalIncome')}</p>
                <p className="text-xl font-bold text-green-600 tabular-nums">{fmt(summary.income)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex flex-col shadow-sm">
            <CardContent className="flex-1 pt-4 flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-red-500 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">{t('finance.totalExpense')}</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{fmt(summary.expense)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex flex-col shadow-sm">
            <CardContent className="flex-1 pt-4 flex items-center gap-3">
              <Wallet className="h-8 w-8 text-blue-500 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">{t('finance.balance')}</p>
                <p className={`text-xl font-bold tabular-nums ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(summary.balance)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['', 'income', 'expense'] as TxType[]).map((ty) => (
          <Button
            key={ty}
            variant={typeFilter === ty ? 'default' : 'outline'}
            size="sm"
            onClick={() => changeTypeFilter(ty)}
          >
            {ty === '' ? t('finance.all') : t(`finance.${ty}`)}
          </Button>
        ))}
        <Input
          type="search"
          placeholder={t('finance.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 max-w-xs ml-auto"
        />
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : transactions.length === 0 ? (
        <EmptyState message={t('finance.noTransactions')} />
      ) : view === 'list' ? (
        <Card className="overflow-x-auto shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t('common.type')}</TableHead>
                <TableHead>{t('finance.title_field')}</TableHead>
                <TableHead>{t('finance.date')}</TableHead>
                <TableHead>{t('finance.category')}</TableHead>
                <TableHead>{t('common.buddies')}</TableHead>
                <TableHead className="text-right">{t('finance.amount')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      tx.type === 'income' ? 'bg-green-100 text-green-600 dark:bg-green-950' : 'bg-red-100 text-red-600 dark:bg-red-950'
                    }`}>
                      {tx.type === 'income' ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{tx.title}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {tx.category ? <Badge variant="secondary" className="text-xs">{tx.category}</Badge> : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tx.contact_ids?.length > 0 ? (
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{tx.contact_ids.map((cid) => buddyNameById.get(cid)).filter(Boolean).join(', ')}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-semibold tabular-nums ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(tx)} aria-label={t('finance.editTransaction')}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(tx.id)} aria-label={t('finance.deleteTransaction')}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {transactions.map((tx) => (
            <Card key={tx.id} className="flex flex-col">
              <CardContent className="flex-1 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      tx.type === 'income' ? 'bg-green-100 text-green-600 dark:bg-green-950' : 'bg-red-100 text-red-600 dark:bg-red-950'
                    }`}>
                      {tx.type === 'income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <span className="font-medium">{tx.title}</span>
                  </div>
                  <span className={`font-semibold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(tx.date).toLocaleDateString()}</span>
                  {tx.category && (
                    <Badge variant="secondary" className="text-xs">{tx.category}</Badge>
                  )}
                </div>
                {tx.contact_ids?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3 w-3" />
                    {tx.contact_ids.map((cid) => buddyNameById.get(cid)).filter(Boolean).join(', ')}
                  </div>
                )}
                <div className="flex gap-1 pt-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(tx)} aria-label={t('finance.editTransaction')}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteTarget(tx.id)} aria-label={t('finance.deleteTransaction')}>
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
            <DialogTitle>{editing ? t('finance.title') : t('finance.newTransaction')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tx-title">{t('finance.title_field')}</Label>
              <Input id="tx-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tx-amount">{t('finance.amount')}</Label>
                <Input
                  id="tx-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('finance.type')}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={form.type === 'income' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setForm({ ...form, type: 'income' })}
                  >
                    {t('finance.income')}
                  </Button>
                  <Button
                    type="button"
                    variant={form.type === 'expense' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setForm({ ...form, type: 'expense' })}
                  >
                    {t('finance.expense')}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tx-category">{t('finance.category')}</Label>
                <Input id="tx-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-date">{t('finance.date')}</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-notes">{t('finance.notes')}</Label>
              <Textarea id="tx-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('common.buddies')}</Label>
              <BuddyPicker
                buddies={buddies}
                selectedIds={form.contact_ids}
                onChange={(ids) => setForm({ ...form, contact_ids: ids })}
                onBuddiesUpdate={() => qc.invalidateQueries({ queryKey: rootKey('contacts') })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!form.title || !form.amount || !form.date || createTx.isPending || updateTx.isPending}>
              {editing ? t('finance.title') : t('finance.newTransaction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={t('finance.deleteTransaction')}
        message={t('finance.deleteConfirm')}
        confirmText={t('finance.deleteTransaction')}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
