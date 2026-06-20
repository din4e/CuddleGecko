import { useState, useRef, memo, useCallback, useDeferredValue } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { uploadApi } from '../api/upload'

import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import AvatarDisplay from '../components/AvatarDisplay'
import EmojiPicker from '../components/EmojiPicker'
import type { Contact } from '../types'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import { Plus, Search, X, Upload } from 'lucide-react'
import { useContactsList, useCreateContact } from '../hooks/api/useContacts'
import Pagination from '../components/Pagination'
import EmptyState from '../components/EmptyState'
import ListPageHeader from '../components/ListPageHeader'

const presetLabelKeys = ['family', 'friend', 'colleague', 'client', 'pet', 'other'] as const

const labelColors: Record<string, string> = {
  family: 'bg-pink-100 text-pink-800',
  friend: 'bg-green-100 text-green-800',
  colleague: 'bg-blue-100 text-blue-800',
  client: 'bg-purple-100 text-purple-800',
  pet: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-800',
}

function LabelPicker({ selected, onChange, t }: {
  selected: string[]
  onChange: (labels: string[]) => void
  t: (key: string) => string
}) {
  const [customInput, setCustomInput] = useState('')

  const togglePreset = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((l) => l !== key))
    } else {
      onChange([...selected, key])
    }
  }

  const addCustom = () => {
    const trimmed = customInput.trim()
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed])
    }
    setCustomInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presetLabelKeys.map((key) => {
          const active = selected.includes(key)
          return (
            <Badge
              key={key}
              variant={active ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              aria-pressed={active}
              render={
                <button
                  type="button"
                  onClick={() => togglePreset(key)}
                  aria-label={t(`relationships.${key}`)}
                />
              }
            >
              {t(`relationships.${key}`)}
            </Badge>
          )
        })}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder={t('contacts.labelPlaceholder')}
          className="flex-1 h-8 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom} className="h-8">
          {t('contacts.addLabel')}
        </Button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((label) => (
            <Badge key={label} variant="secondary" className="gap-1">
              {label in labelColors ? t(`relationships.${label}`) : label}
              <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="Remove" onClick={() => onChange(selected.filter((l) => l !== label))}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  t: (key: string) => string
}

function ContactFormDialog({ open, onOpenChange, t }: ContactFormDialogProps) {
  const [newContact, setNewContact] = useState({
    name: '', emails: [] as string[], phones: [] as string[], avatar_emoji: '', avatar_url: '', relationship_labels: [] as string[],
  })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createContact = useCreateContact()

  const resetForm = () => {
    setNewContact({ name: '', emails: [] as string[], phones: [] as string[], avatar_emoji: '', avatar_url: '', relationship_labels: [] })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadApi.avatar(file)
      setNewContact((prev) => ({ ...prev, avatar_url: res.data.url, avatar_emoji: '' }))
    } finally {
      setUploading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await createContact.mutateAsync(newContact)
    onOpenChange(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('contacts.newContact')}</DialogTitle></DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('contacts.avatar')}</Label>
            <div className="flex items-center gap-3">
              <EmojiPicker
                value={newContact.avatar_emoji}
                onChange={(emoji) => setNewContact((prev) => ({ ...prev, avatar_emoji: emoji, avatar_url: emoji ? '' : prev.avatar_url }))}
              />
              <span className="text-muted-foreground text-sm">或</span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label={t('contacts.uploadImage')}>
                  <Upload className="h-4 w-4 mr-1" />{uploading ? '…' : t('contacts.uploadImage')}
                </Button>
                {newContact.avatar_url && (
                  <div className="flex items-center gap-1">
                    <img src={newContact.avatar_url} alt="preview" className="h-8 w-8 rounded-full object-cover" />
                    <button type="button" onClick={() => setNewContact((prev) => ({ ...prev, avatar_url: '' }))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-name">{t('contacts.name')}</Label>
            <Input id="contact-name" value={newContact.name} onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">{t('auth.email')}</Label>
            <Input id="contact-email" type="email" placeholder="email@example.com" spellCheck={false} value={newContact.emails.join(', ')} onChange={(e) => setNewContact((prev) => ({ ...prev, emails: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-phone">{t('contacts.phone')}</Label>
            <Input id="contact-phone" type="tel" value={newContact.phones.join(', ')} onChange={(e) => setNewContact((prev) => ({ ...prev, phones: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('contacts.relationship')}</Label>
            <LabelPicker
              selected={newContact.relationship_labels}
              onChange={(labels) => setNewContact((prev) => ({ ...prev, relationship_labels: labels }))}
              t={t}
            />
          </div>
          <Button type="submit" className="w-full" disabled={createContact.isPending}>{t('contacts.createContact')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ContactGridCardProps {
  contact: Contact
  labelRenderer: (label: string) => string
}

const ContactGridCard = memo(function ContactGridCard({ contact, labelRenderer }: ContactGridCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <AvatarDisplay
            emoji={contact.avatar_emoji}
            imageUrl={contact.avatar_url}
            name={contact.name}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{contact.name}</div>
            {contact.emails?.length > 0 && <div className="text-sm text-muted-foreground truncate">{contact.emails.join(', ')}</div>}
          </div>
          <div className="flex flex-wrap gap-0.5 justify-end max-w-[120px]">
            {(contact.relationship_labels || []).slice(0, 2).map((label) => (
              <Badge key={label} variant="secondary" className={`text-xs ${labelColors[label] || ''}`}>
                {labelRenderer(label)}
              </Badge>
            ))}
            {(contact.relationship_labels || []).length > 2 && (
              <Badge variant="secondary" className="text-xs">+{contact.relationship_labels.length - 2}</Badge>
            )}
          </div>
        </div>
        {contact.tags?.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {contact.tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-xs" style={{ borderColor: tag.color, color: tag.color }}>
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
})

interface ContactTableRowProps {
  contact: Contact
  labelRenderer: (label: string) => string
}

const ContactTableRow = memo(function ContactTableRow({ contact, labelRenderer }: ContactTableRowProps) {
  return (
    <TableRow className="cursor-pointer">
      <TableCell>
        <Link to={`/buddies/${contact.id}`} className="flex items-center gap-3 hover:underline">
          <AvatarDisplay emoji={contact.avatar_emoji} imageUrl={contact.avatar_url} name={contact.name} />
          <span className="font-medium">{contact.name}</span>
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{contact.emails?.join(', ') || '—'}</TableCell>
      <TableCell className="text-muted-foreground">{contact.phones?.join(', ') || '—'}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {(contact.relationship_labels || []).map((label) => (
            <Badge key={label} variant="secondary" className={`text-xs ${labelColors[label] || ''}`}>
              {labelRenderer(label)}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap gap-1 justify-end">
          {contact.tags?.map((tag) => (
            <Badge key={tag.id} variant="outline" className="text-xs" style={{ borderColor: tag.color, color: tag.color }}>
              {tag.name}
            </Badge>
          ))}
        </div>
      </TableCell>
    </TableRow>
  )
})

export default function ContactsPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [view, setView] = useViewMode('contacts')

  const pageSize = 12

  const { data, isPending, isFetching } = useContactsList({
    page,
    page_size: pageSize,
    search: deferredSearch || undefined,
  })

  const contacts = data?.items ?? []
  const total = data?.total ?? 0

  const labelRenderer = useCallback((label: string) => label in labelColors ? t(`relationships.${label}`) : label, [t])

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('contacts.title')}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('contacts.addContact')}</Button>
            <ContactFormDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              t={t}
            />
          </>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('contacts.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-10"
        />
      </div>

      {isPending ? (
        <div>{t('dashboard.loading')}</div>
      ) : contacts.length === 0 ? (
        <EmptyState message={t('contacts.noContacts')} />
      ) : view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy={isFetching}>
          {contacts.map((contact) => (
            <Link key={contact.id} to={`/buddies/${contact.id}`}>
              <ContactGridCard contact={contact} labelRenderer={labelRenderer} />
            </Link>
          ))}
        </div>
      ) : (
        <Card aria-busy={isFetching}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">{t('contacts.name')}</TableHead>
                <TableHead>{t('auth.email')}</TableHead>
                <TableHead>{t('contacts.phone')}</TableHead>
                <TableHead>{t('contacts.relationship')}</TableHead>
                <TableHead className="text-right">Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <ContactTableRow key={contact.id} contact={contact} labelRenderer={labelRenderer} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
    </div>
  )
}
