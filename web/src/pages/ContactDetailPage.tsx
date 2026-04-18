import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import { contactsApi } from '../api/contacts'
import { interactionsApi } from '../api/interactions'
import { remindersApi } from '../api/reminders'
import { relationsApi } from '../api/relations'
import { tagsApi } from '../api/tags'
import { uploadApi } from '../api/upload'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog'
import type { Contact, Interaction, Reminder, ContactRelation, InteractionType, Tag } from '../types'
import { ArrowLeft, Mail, Phone, Calendar, Pencil, Plus, Trash2, X, Upload, Sparkles, Loader2 } from 'lucide-react'
import AvatarDisplay from '../components/AvatarDisplay'
import EmojiPicker from '../components/EmojiPicker'
import BuddyPicker from '../components/BuddyPicker'

const labelColors: Record<string, string> = {
  family: 'bg-pink-100 text-pink-800',
  friend: 'bg-green-100 text-green-800',
  colleague: 'bg-blue-100 text-blue-800',
  client: 'bg-purple-100 text-purple-800',
  pet: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-800',
}
const presetLabelKeys = ['family', 'friend', 'colleague', 'client', 'pet', 'other'] as const

const interactionTypes: InteractionType[] = ['meeting', 'call', 'message', 'email', 'other']

export default function ContactDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const contactId = id ? parseInt(id) : 0

  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [relations, setRelations] = useState<ContactRelation[]>([])
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  // AI analysis
  const adapters = useModeStore((s) => s.adapters)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const handleAnalyzeRelationship = async () => {
    if (!adapters?.ai) return
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      const res = await adapters.ai.analyzeRelationship(contactId)
      setAnalysisResult(res.analysis)
    } catch {
      setAnalysisResult(t('ai.sendFailed'))
    } finally {
      setAnalyzing(false)
    }
  }

  // Edit contact dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', nickname: '', emails: [] as string[], phones: [] as string[], birthday: '', notes: '', relationship_labels: [] as string[], avatar_emoji: '', avatar_url: '' })
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Interaction dialog
  const [intDialog, setIntDialog] = useState<{ open: boolean; editing: Interaction | null }>({ open: false, editing: null })
  const [intForm, setIntForm] = useState({ type: 'meeting' as InteractionType, title: '', content: '', occurred_at: '' })

  // Reminder dialog
  const [remDialog, setRemDialog] = useState<{ open: boolean; editing: Reminder | null }>({ open: false, editing: null })
  const [remForm, setRemForm] = useState({ title: '', description: '', remind_at: '' })

  // Relation dialog
  const [relDialog, setRelDialog] = useState(false)
  const [relForm, setRelForm] = useState({ contact_ids: [] as number[], relation_type: '' })

  const loadData = useCallback(async () => {
    if (!contactId) return
    setLoading(true)
    try {
      const [cRes, iRes, rRes, relRes, allRes, tagsRes] = await Promise.all([
        contactsApi.get(contactId),
        interactionsApi.list(contactId, { page: 1, page_size: 50 }),
        remindersApi.list(),
        relationsApi.list(contactId),
        contactsApi.list({ page: 1, page_size: 200 }),
        tagsApi.list(),
      ])
      setContact(cRes.data)
      setInteractions(iRes.data.items || [])
      setReminders((Array.isArray(rRes.data) ? rRes.data : []).filter((r: Reminder) => r.contact_id === contactId))
      setRelations(Array.isArray(relRes.data) ? relRes.data : [])
      setAllContacts((allRes.data.items || []).filter((c: Contact) => c.id !== contactId))
      setAllTags(Array.isArray(tagsRes.data) ? tagsRes.data : [])
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return <div>{t('dashboard.loading')}</div>
  if (!contact) return <div>{t('contacts.notFound')}</div>

  // --- Contact edit ---
  const openEditContact = () => {
    setEditForm({
      name: contact.name || '',
      nickname: contact.nickname || '',
      emails: contact.emails || [],
      phones: contact.phones || [],
      birthday: contact.birthday ? contact.birthday.slice(0, 10) : '',
      notes: contact.notes || '',
      relationship_labels: contact.relationship_labels || [],
      avatar_emoji: contact.avatar_emoji || '',
      avatar_url: contact.avatar_url || '',
    })
    setSelectedTagIds((contact.tags || []).map((tag) => tag.id))
    setEditOpen(true)
  }

  const handleSaveContact = async () => {
    await contactsApi.update(contact.id, {
      ...editForm,
      birthday: editForm.birthday || null,
      avatar_emoji: editForm.avatar_emoji,
      avatar_url: editForm.avatar_url,
    })
    await contactsApi.replaceTags(contact.id, selectedTagIds)
    setEditOpen(false)
    loadData()
  }

  const handleDeleteContact = async () => {
    if (confirm(t('contacts.deleteConfirm'))) {
      await contactsApi.delete(contact.id)
      navigate('/buddies')
    }
  }

  // --- Interaction CRUD ---
  const openCreateInt = () => {
    setIntForm({ type: 'meeting', title: '', content: '', occurred_at: new Date().toISOString().slice(0, 16) })
    setIntDialog({ open: true, editing: null })
  }
  const openEditInt = (i: Interaction) => {
    setIntForm({ type: i.type, title: i.title, content: i.content || '', occurred_at: i.occurred_at ? new Date(i.occurred_at).toISOString().slice(0, 16) : '' })
    setIntDialog({ open: true, editing: i })
  }
  const handleSaveInt = async () => {
    const payload = { ...intForm, occurred_at: intForm.occurred_at ? new Date(intForm.occurred_at).toISOString() : undefined }
    if (intDialog.editing) {
      await interactionsApi.update(intDialog.editing.id, payload)
    } else {
      await interactionsApi.create(contactId, payload)
    }
    setIntDialog({ open: false, editing: null })
    loadData()
  }
  const handleDeleteInt = async (intId: number) => {
    await interactionsApi.delete(intId)
    loadData()
  }

  // --- Reminder CRUD ---
  const openCreateRem = () => {
    setRemForm({ title: '', description: '', remind_at: new Date().toISOString().slice(0, 16) })
    setRemDialog({ open: true, editing: null })
  }
  const openEditRem = (r: Reminder) => {
    setRemForm({ title: r.title, description: r.description || '', remind_at: r.remind_at ? new Date(r.remind_at).toISOString().slice(0, 16) : '' })
    setRemDialog({ open: true, editing: r })
  }
  const handleSaveRem = async () => {
    const payload = { ...remForm, remind_at: remForm.remind_at ? new Date(remForm.remind_at).toISOString() : undefined }
    if (remDialog.editing) {
      await remindersApi.update(remDialog.editing.id, payload)
    } else {
      await remindersApi.create(contactId, payload)
    }
    setRemDialog({ open: false, editing: null })
    loadData()
  }
  const handleDeleteRem = async (remId: number) => {
    await remindersApi.delete(remId)
    loadData()
  }

  // --- Relation CRUD ---
  const openCreateRel = () => {
    setRelForm({ contact_ids: [], relation_type: '' })
    setRelDialog(true)
  }
  const handleSaveRel = async () => {
    if (relForm.contact_ids.length === 0) return
    for (const cid of relForm.contact_ids) {
      await relationsApi.create(contactId, { contact_id_b: cid, relation_type: relForm.relation_type })
    }
    setRelDialog(false)
    loadData()
  }
  const handleDeleteRel = async (relId: number) => {
    await relationsApi.delete(relId)
    loadData()
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/buddies')}>
        <ArrowLeft className="h-4 w-4 mr-2" />{t('contacts.backToContacts')}
      </Button>

      {/* Contact Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <AvatarDisplay emoji={contact.avatar_emoji} imageUrl={contact.avatar_url} name={contact.name} size="lg" />
              <div>
                <CardTitle className="text-2xl">{contact.name}</CardTitle>
                {contact.nickname && <p className="text-muted-foreground">{contact.nickname}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleAnalyzeRelationship} disabled={analyzing}>
                {analyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {t('ai.analyzeRelationship')}
              </Button>
              <Button size="sm" variant="outline" onClick={openEditContact}><Pencil className="h-4 w-4 mr-1" />{t('contacts.editContact')}</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteContact}>{t('contacts.delete')}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {contact.emails?.length > 0 && <div className="flex items-center gap-2"><Mail className="h-4 w-4" />{contact.emails.join(', ')}</div>}
            {contact.phones?.length > 0 && <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{contact.phones.join(', ')}</div>}
            {contact.birthday && <div className="flex items-center gap-2"><Calendar className="h-4 w-4" />{new Date(contact.birthday).toLocaleDateString()}</div>}
          </div>
          {contact.notes && <p className="mt-4 text-sm text-muted-foreground">{contact.notes}</p>}
          {(contact.relationship_labels || []).length > 0 && (
            <div className="flex gap-1 mt-4">
              {contact.relationship_labels.map((label) => (
                <Badge key={label} variant="secondary" className={labelColors[label] || ''}>
                  {label in labelColors ? t(`relationships.${label}`) : label}
                </Badge>
              ))}
            </div>
          )}
          {contact.tags?.length > 0 && (
            <div className="flex gap-1 mt-4">
              {contact.tags.map((tag) => (
                <Badge key={tag.id} variant="outline" style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      {/* AI Analysis Result */}
      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" />
              {t('ai.analysisTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm">{analysisResult}</div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="interactions">
        <TabsList>
          <TabsTrigger value="interactions">{t('contacts.interactionsTab')} ({interactions.length})</TabsTrigger>
          <TabsTrigger value="reminders">{t('contacts.remindersTab')} ({reminders.length})</TabsTrigger>
          <TabsTrigger value="relations">{t('contacts.relationsTab')} ({relations.length})</TabsTrigger>
        </TabsList>

        {/* Interactions */}
        <TabsContent value="interactions" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openCreateInt}><Plus className="h-4 w-4 mr-1" />{t('contacts.newInteraction')}</Button>
          </div>
          {interactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('contacts.noInteractions')}</p>
          ) : (
            <div className="space-y-3">
              {interactions.map((i) => (
                <Card key={i.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{i.title}</div>
                        <Badge variant="secondary" className="mt-1">{i.type}</Badge>
                        {i.content && <p className="text-sm text-muted-foreground mt-2">{i.content}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{new Date(i.occurred_at).toLocaleDateString()}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditInt(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteInt(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Reminders */}
        <TabsContent value="reminders" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openCreateRem}><Plus className="h-4 w-4 mr-1" />{t('contacts.newReminder')}</Button>
          </div>
          {reminders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('contacts.noReminders')}</p>
          ) : (
            <div className="space-y-3">
              {reminders.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <Badge variant={r.status === 'pending' ? 'default' : 'secondary'}>{r.status}</Badge>
                        <div className="text-sm text-muted-foreground mt-1">{new Date(r.remind_at).toLocaleDateString()}</div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditRem(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteRem(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Relations */}
        <TabsContent value="relations" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openCreateRel}><Plus className="h-4 w-4 mr-1" />{t('contacts.newRelation')}</Button>
          </div>
          {relations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('contacts.noRelations')}</p>
          ) : (
            <div className="space-y-3">
              {relations.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{t('contacts.relatedTo')} #{r.contact_id_a === contact.id ? r.contact_id_b : r.contact_id_a}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{r.relation_type || t('contacts.connected')}</Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteRel(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Contact Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('contacts.editContact')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contacts.avatar')}</Label>
              <div className="flex items-center gap-3">
                <EmojiPicker
                  value={editForm.avatar_emoji}
                  onChange={(emoji) => setEditForm({ ...editForm, avatar_emoji: emoji, avatar_url: emoji ? '' : editForm.avatar_url })}
                />
                <span className="text-muted-foreground text-sm">或</span>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setUploading(true)
                      try {
                        const res = await uploadApi.avatar(file)
                        setEditForm({ ...editForm, avatar_url: res.data.url, avatar_emoji: '' })
                      } finally {
                        setUploading(false)
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-1" />{uploading ? '...' : t('contacts.uploadImage')}
                  </Button>
                  {editForm.avatar_url && (
                    <div className="flex items-center gap-1">
                      <img src={editForm.avatar_url} alt="preview" className="h-8 w-8 rounded-full object-cover" />
                      <button type="button" onClick={() => setEditForm({ ...editForm, avatar_url: '' })} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('contacts.name')}</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('contacts.nickname')}</Label>
                <Input value={editForm.nickname} onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('auth.email')}</Label>
                <Input placeholder="email@example.com" value={editForm.emails.join(', ')} onChange={(e) => setEditForm({ ...editForm, emails: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="space-y-2">
                <Label>{t('contacts.phone')}</Label>
                <Input value={editForm.phones.join(', ')} onChange={(e) => setEditForm({ ...editForm, phones: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.birthday')}</Label>
              <Input type="date" value={editForm.birthday} onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.notes')}</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.relationship')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {presetLabelKeys.map((key) => {
                  const active = editForm.relationship_labels.includes(key)
                  return (
                    <Badge key={key} variant={active ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => {
                      setEditForm({
                        ...editForm,
                        relationship_labels: active ? editForm.relationship_labels.filter((l) => l !== key) : [...editForm.relationship_labels, key],
                      })
                    }}>
                      {t(`relationships.${key}`)}
                    </Badge>
                  )
                })}
              </div>
            </div>
            {allTags.length > 0 && (
              <div className="space-y-2">
                <Label>{t('tags.title')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id)
                    return (
                      <Badge
                        key={tag.id}
                        variant={active ? 'default' : 'outline'}
                        className="cursor-pointer select-none"
                        style={active ? { backgroundColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                        onClick={() => {
                          setSelectedTagIds(active ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id])
                        }}
                      >
                        {tag.name}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('contacts.cancel')}</Button>
            <Button onClick={handleSaveContact} disabled={!editForm.name}>{t('contacts.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interaction Dialog */}
      <Dialog open={intDialog.open} onOpenChange={(o) => setIntDialog({ ...intDialog, open: o })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{intDialog.editing ? t('contacts.editInteraction') : t('contacts.newInteraction')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('contacts.title_field') || 'Title'}</Label>
                <Input value={intForm.title} onChange={(e) => setIntForm({ ...intForm, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {interactionTypes.map((ty) => (
                    <Badge key={ty} variant={intForm.type === ty ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setIntForm({ ...intForm, type: ty })}>
                      {ty}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea value={intForm.content} onChange={(e) => setIntForm({ ...intForm, content: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="datetime-local" value={intForm.occurred_at} onChange={(e) => setIntForm({ ...intForm, occurred_at: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntDialog({ open: false, editing: null })}>{t('contacts.cancel')}</Button>
            <Button onClick={handleSaveInt} disabled={!intForm.title}>{t('contacts.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reminder Dialog */}
      <Dialog open={remDialog.open} onOpenChange={(o) => setRemDialog({ ...remDialog, open: o })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{remDialog.editing ? t('contacts.editReminder') : t('contacts.newReminder')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contacts.title_field') || 'Title'}</Label>
              <Input value={remForm.title} onChange={(e) => setRemForm({ ...remForm, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={remForm.description} onChange={(e) => setRemForm({ ...remForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Remind At</Label>
              <Input type="datetime-local" value={remForm.remind_at} onChange={(e) => setRemForm({ ...remForm, remind_at: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemDialog({ open: false, editing: null })}>{t('contacts.cancel')}</Button>
            <Button onClick={handleSaveRem} disabled={!remForm.title}>{t('contacts.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relation Dialog */}
      <Dialog open={relDialog} onOpenChange={setRelDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('contacts.newRelation')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contacts.selectBuddy')}</Label>
              <BuddyPicker
                buddies={allContacts}
                selectedIds={relForm.contact_ids}
                onChange={(ids) => setRelForm({ ...relForm, contact_ids: ids })}
                onBuddiesUpdate={setAllContacts}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.relationType')}</Label>
              <Input value={relForm.relation_type} onChange={(e) => setRelForm({ ...relForm, relation_type: e.target.value })} placeholder={t('contacts.relationType')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelDialog(false)}>{t('contacts.cancel')}</Button>
            <Button onClick={handleSaveRel} disabled={relForm.contact_ids.length === 0}>{t('contacts.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
