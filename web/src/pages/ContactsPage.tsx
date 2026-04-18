import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { contactsApi } from '../api/contacts'
import { uploadApi } from '../api/upload'

import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import AvatarDisplay from '../components/AvatarDisplay'
import EmojiPicker from '../components/EmojiPicker'
import type { Contact } from '../types'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import { Plus, Search, X, Upload } from 'lucide-react'

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
              onClick={() => togglePreset(key)}
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
              <X className="h-3 w-3 cursor-pointer" onClick={() => onChange(selected.filter((l) => l !== label))} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ContactsPage() {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newContact, setNewContact] = useState({
    name: '', emails: [] as string[], phones: [] as string[], avatar_emoji: '', avatar_url: '', relationship_labels: [] as string[],
  })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useViewMode('contacts')

  const pageSize = 12

  const loadContacts = async () => {
    setLoading(true)
    try {
      const res = await contactsApi.list({ page, page_size: pageSize, search: search || undefined })
      const data = res.data
      setContacts(data.items || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadContacts() }, [page, search])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadApi.avatar(file)
      setNewContact({ ...newContact, avatar_url: res.data.url, avatar_emoji: '' })
    } finally {
      setUploading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await contactsApi.create(newContact)
    setDialogOpen(false)
    setNewContact({ name: '', emails: [] as string[], phones: [] as string[], avatar_emoji: '', avatar_url: '', relationship_labels: [] })
    loadContacts()
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('contacts.title')}</h1>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button><Plus className="h-4 w-4 mr-2" />{t('contacts.addContact')}</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('contacts.newContact')}</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('contacts.avatar')}</Label>
                <div className="flex items-center gap-3">
                  <EmojiPicker
                    value={newContact.avatar_emoji}
                    onChange={(emoji) => setNewContact({ ...newContact, avatar_emoji: emoji, avatar_url: emoji ? '' : newContact.avatar_url })}
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
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Upload className="h-4 w-4 mr-1" />{uploading ? '...' : t('contacts.uploadImage')}
                    </Button>
                    {newContact.avatar_url && (
                      <div className="flex items-center gap-1">
                        <img src={newContact.avatar_url} alt="preview" className="h-8 w-8 rounded-full object-cover" />
                        <button type="button" onClick={() => setNewContact({ ...newContact, avatar_url: '' })} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('contacts.name')}</Label>
                <Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.email')}</Label>
                <Input type="email" placeholder="email@example.com" value={newContact.emails.join(', ')} onChange={(e) => setNewContact({ ...newContact, emails: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="space-y-2">
                <Label>{t('contacts.phone')}</Label>
                <Input value={newContact.phones.join(', ')} onChange={(e) => setNewContact({ ...newContact, phones: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="space-y-2">
                <Label>{t('contacts.relationship')}</Label>
                <LabelPicker
                  selected={newContact.relationship_labels}
                  onChange={(labels) => setNewContact({ ...newContact, relationship_labels: labels })}
                  t={t}
                />
              </div>
              <Button type="submit" className="w-full">{t('contacts.createContact')}</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('contacts.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div>{t('dashboard.loading')}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('contacts.noContacts')}</div>
      ) : view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <Link key={contact.id} to={`/buddies/${contact.id}`}>
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
                          {label in labelColors ? t(`relationships.${label}`) : label}
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
            </Link>
          ))}
        </div>
      ) : (
        <Card>
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
                <TableRow key={contact.id} className="cursor-pointer" onClick={() => window.location.href = `/buddies/${contact.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <AvatarDisplay emoji={contact.avatar_emoji} imageUrl={contact.avatar_url} name={contact.name} />
                      <span className="font-medium">{contact.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.emails?.join(', ') || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.phones?.join(', ') || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(contact.relationship_labels || []).map((label) => (
                        <Badge key={label} variant="secondary" className={`text-xs ${labelColors[label] || ''}`}>
                          {label in labelColors ? t(`relationships.${label}`) : label}
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('contacts.previous')}</Button>
          <span className="flex items-center text-sm text-muted-foreground">{t('contacts.page')} {page} {t('contacts.of')} {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('contacts.next')}</Button>
        </div>
      )}
    </div>
  )
}
