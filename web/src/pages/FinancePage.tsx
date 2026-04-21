import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { transactionApi } from '../api/transaction'
import { contactsApi } from '../api/contacts'
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
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import type { Transaction, TransactionSummary, Contact } from '../types'

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
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [buddies, setBuddies] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TxType>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState<TxFormData>(emptyForm)
  const [view, setView] = useViewMode('finance')

  const loadData = async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: 1, page_size: 50 }
      if (typeFilter) params.type = typeFilter
      const [txRes, sumRes] = await Promise.all([
        transactionApi.list(params),
        transactionApi.summary(),
      ])
      const data = txRes.data
      setTransactions(Array.isArray(data?.items) ? data.items : [])
      setSummary(sumRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    contactsApi.list({ page: 1, page_size: 200 }).then((res) => setBuddies(res.data.items || []))
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter])

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
    const payload: Record<string, unknown> = {
      title: form.title,
      amount: parseFloat(form.amount),
      type: form.type,
      category: form.category,
      date: form.date ? new Date(form.date).toISOString() : undefined,
      notes: form.notes,
      contact_ids: form.contact_ids,
    }

    if (editing) {
      await transactionApi.update(editing.id, payload)
    } else {
      await transactionApi.create(payload)
    }

    setDialogOpen(false)
    loadData()
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('finance.deleteConfirm'))) {
      await transactionApi.delete(id)
      loadData()
    }
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('finance.title')}</h1>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('finance.newTransaction')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">{t('finance.totalIncome')}</p>
                <p className="text-xl font-bold text-green-600 tabular-nums">{fmt(summary.income)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-red-500" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">{t('finance.totalExpense')}</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{fmt(summary.expense)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Wallet className="h-8 w-8 text-blue-500" aria-hidden="true" />
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

      {/* Type Filter */}
      <div className="flex gap-2">
        {(['', 'income', 'expense'] as TxType[]).map((ty) => (
          <Button
            key={ty}
            variant={typeFilter === ty ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTypeFilter(ty)}
          >
            {ty === '' ? t('finance.all') : t(`finance.${ty}`)}
          </Button>
        ))}
      </div>

      {/* Transaction List/Grid */}
      {loading ? (
        <div>{t('finance.loading')}</div>
      ) : transactions.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('finance.noTransactions')}</p>
      ) : view === 'list' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Type</TableHead>
                <TableHead>{t('finance.title_field')}</TableHead>
                <TableHead>{t('finance.date')}</TableHead>
                <TableHead>{t('finance.category')}</TableHead>
                <TableHead>Buddies</TableHead>
                <TableHead className="text-right">{t('finance.amount')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{tx.contact_ids.map((cid) => buddies.find((b) => b.id === cid)?.name).filter(Boolean).join(', ')}</span>
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
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(tx.id)} aria-label={t('finance.deleteTransaction')}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <Card key={tx.id}>
              <CardContent className="pt-4 space-y-3">
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
                    {tx.contact_ids.map((cid) => buddies.find((b) => b.id === cid)?.name).filter(Boolean).join(', ')}
                  </div>
                )}
                <div className="flex gap-1 pt-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(tx)} aria-label={t('finance.editTransaction')}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(tx.id)} aria-label={t('finance.deleteTransaction')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('finance.title') : t('finance.newTransaction')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('finance.title_field')}</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('finance.amount')}</Label>
                <Input
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
                <Label>{t('finance.category')}</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('finance.date')}</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('finance.notes')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
            <Button onClick={handleSubmit} disabled={!form.title || !form.amount || !form.date}>
              {editing ? t('finance.title') : t('finance.newTransaction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
