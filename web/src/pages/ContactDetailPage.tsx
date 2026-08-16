import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d'
import type ForceGraph2DType from 'react-force-graph-2d'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import { useIsDarkMode } from '../hooks/useIsDarkMode'
import { contactsApi } from '../api/contacts'
import { interactionsApi } from '../api/interactions'
import { remindersApi } from '../api/reminders'
import { relationsApi } from '../api/relations'
import { tagsApi } from '../api/tags'
import { uploadApi } from '../api/upload'
import { ListSkeleton } from '../components/ListSkeleton'
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
import { ConfirmDialog } from '../components/ConfirmDialog'
import { labelColors, presetLabelKeys, getNodeLabelColor } from '../lib/constants'

const ForceGraph2D = lazy(() => import('react-force-graph-2d')) as unknown as typeof ForceGraph2DType

const interactionTypes: InteractionType[] = ['meeting', 'call', 'message', 'email', 'other']

type MiniGraphNodeData = {
  id: number
  name: string
  relationship_labels: string[]
  avatar_emoji: string
  __isCenter: boolean
}
type MiniGraphNode = NodeObject<MiniGraphNodeData>
type MiniGraphLink = LinkObject<MiniGraphNodeData, { relation_type: string }>

export default function ContactDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const numericId = id ? Number(id) : NaN
  const contactId = Number.isInteger(numericId) && numericId > 0 ? numericId : 0

  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [relations, setRelations] = useState<ContactRelation[]>([])
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const dark = useIsDarkMode()
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

  // Mini relationship graph data
  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const fgRef = useRef<ForceGraphMethods<MiniGraphNode, MiniGraphLink> | undefined>(undefined)
  const [graphDims, setGraphDims] = useState({ width: 600, height: 400 })

  const measureGraph = useCallback(() => {
    const el = graphContainerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(200, Math.floor(rect.width))
    const height = Math.max(300, Math.floor(rect.height))
    setGraphDims((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
  }, [])

  // Callback ref: fires when the graph container mounts/unmounts (i.e. when the
  // graph tab is activated). Lets us attach ResizeObserver at the right time,
  // since the container doesn't exist on initial mount when the user is on the
  // interactions tab.
  const setGraphContainerRef = useCallback((el: HTMLDivElement | null) => {
    graphContainerRef.current = el
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    if (!el) return
    measureGraph()
    const ro = new ResizeObserver(measureGraph)
    ro.observe(el)
    resizeObserverRef.current = ro
  }, [measureGraph])

  useEffect(() => {
    window.addEventListener('resize', measureGraph)
    return () => {
      window.removeEventListener('resize', measureGraph)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
    }
  }, [measureGraph])
  const miniGraphData = useMemo(() => {
    if (!contact) return { nodes: [], links: [] }
    const connectedIds = new Set<number>()
    const links: { source: number; target: number; relation_type: string }[] = []
    for (const r of relations) {
      const otherId = r.contact_id_a === contact.id ? r.contact_id_b : r.contact_id_a
      connectedIds.add(otherId)
      links.push({ source: r.contact_id_a, target: r.contact_id_b, relation_type: r.relation_type })
    }
    const contactMap = new Map<number, Contact>()
    for (const c of allContacts) contactMap.set(c.id, c)
    const nodes = [
      { id: contact.id, name: contact.name, relationship_labels: contact.relationship_labels || [], avatar_emoji: contact.avatar_emoji || '', __isCenter: true },
      ...[...connectedIds].map((cid) => {
        const c = contactMap.get(cid)
        return { id: cid, name: c?.name || `#${cid}`, relationship_labels: c?.relationship_labels || [], avatar_emoji: c?.avatar_emoji || '', __isCenter: false }
      }),
    ]
    return { nodes, links }
  }, [contact, relations, allContacts])

  // id → name lookup so relation rows render the buddy's name, not a bare "#id".
  const contactNameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of allContacts) m.set(c.id, c.name)
    return m
  }, [allContacts])

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

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!contactId) return
    setLoading(true)
    try {
      const [cRes, iRes, rRes, relRes, allRes, tagsRes] = await Promise.all([
        contactsApi.get(contactId),
        interactionsApi.list(contactId, { page: 1, page_size: 50 }),
        remindersApi.list(undefined, 1, 200, undefined, contactId),
        relationsApi.list(contactId),
        contactsApi.list({ page: 1, page_size: 200 }),
        tagsApi.list(1, 200),
      ])
      setContact(cRes.data)
      setInteractions(iRes.data.items || [])
      const rData = rRes.data
      const rItems: Reminder[] = Array.isArray(rData) ? rData : (rData?.items ?? [])
      setReminders(rItems)
      setRelations(Array.isArray(relRes.data) ? relRes.data : [])
      setAllContacts((allRes.data.items || []).filter((c: Contact) => c.id !== contactId))
      const tData = tagsRes.data
      setAllTags(Array.isArray(tData) ? tData : (tData?.items ?? []))
    } finally {
      setLoading(false)
    }
  }, [contactId])

  // Per-section refetchers: after a mutation only the affected section needs
  // refreshing — not the whole 6-request loadData, which re-pulls the 200-row
  // contacts/tags lists (and everything else) every single time.
  const fetchContact = useCallback(async () => {
    if (!contactId) return
    const res = await contactsApi.get(contactId)
    setContact(res.data)
  }, [contactId])
  const fetchAllContacts = useCallback(async () => {
    const res = await contactsApi.list({ page: 1, page_size: 200 })
    setAllContacts((res.data.items || []).filter((c: Contact) => c.id !== contactId))
  }, [contactId])
  const fetchInteractions = useCallback(async () => {
    if (!contactId) return
    const res = await interactionsApi.list(contactId, { page: 1, page_size: 50 })
    setInteractions(res.data.items || [])
  }, [contactId])
  const fetchReminders = useCallback(async () => {
    if (!contactId) return
    const res = await remindersApi.list(undefined, 1, 200, undefined, contactId)
    const data = res.data
    setReminders(Array.isArray(data) ? data : (data?.items ?? []))
  }, [contactId])
  const fetchRelations = useCallback(async () => {
    if (!contactId) return
    const res = await relationsApi.list(contactId)
    setRelations(Array.isArray(res.data) ? res.data : [])
  }, [contactId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  if (loading) return <ListSkeleton rows={6} />
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
    // Contact details changed → refresh the contact and the buddy list (the
    // name/emoji feeds the graph nodes and pickers); nothing else is affected.
    fetchContact()
    fetchAllContacts()
  }

  const handleDeleteContact = () => setDeleteOpen(true)
  const handleConfirmDeleteContact = async () => {
    await contactsApi.delete(contact.id)
    navigate('/buddies')
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
    fetchInteractions()
  }
  const handleDeleteInt = async (intId: number) => {
    await interactionsApi.delete(intId)
    fetchInteractions()
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
    fetchReminders()
  }
  const handleDeleteRem = async (remId: number) => {
    await remindersApi.delete(remId)
    fetchReminders()
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
    fetchRelations()
  }
  const handleDeleteRel = async (relId: number) => {
    await relationsApi.delete(relId)
    fetchRelations()
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
          <TabsTrigger value="graph">{t('contacts.graphTab')}</TabsTrigger>
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
              {relations.map((r) => {
                const otherId = r.contact_id_a === contact.id ? r.contact_id_b : r.contact_id_a
                const otherName = contactNameById.get(otherId) || `#${otherId}`
                return (
                <Card key={r.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{t('contacts.relatedTo')} {otherName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{r.relation_type || t('contacts.connected')}</Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteRel(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Mini Relationship Graph */}
        <TabsContent value="graph" className="mt-4">
          {miniGraphData.nodes.length <= 1 ? (
            <p className="text-muted-foreground text-center py-8">{t('contacts.noRelations')}</p>
          ) : (
            <Card>
              <CardContent className="p-2 h-[60vh] min-h-[300px]" ref={setGraphContainerRef}>
                <Suspense fallback={<div className="h-48 flex items-center justify-center text-sm text-muted-foreground">{t('graph.loading')}</div>}>
                <ForceGraph2D<MiniGraphNodeData, { relation_type: string }>
                  ref={fgRef}
                  graphData={miniGraphData}
                  nodeLabel="name"
                  nodeColor={(node: MiniGraphNode) => node.__isCenter ? '#10b981' : (node.relationship_labels?.length ? getNodeLabelColor(node.relationship_labels[0]) : '#6b7280')}
                  nodeVal={(node: MiniGraphNode) => node.__isCenter ? 4 : 2}
                  linkColor={() => '#94a3b8'}
                  linkWidth={1.5}
                  linkDirectionalArrowLength={3}
                  linkLabel="relation_type"
                  onNodeClick={(node: MiniGraphNode) => { if (!node.__isCenter) navigate(`/buddies/${node.id}`) }}
                  nodeCanvasObject={(node: MiniGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
                    const x = node.x
                    const y = node.y
                    if (x == null || y == null) return
                    const r = (node.__isCenter ? 10 : 7) / Math.sqrt(globalScale)
                    const color = node.__isCenter ? '#10b981' : (node.relationship_labels?.length ? getNodeLabelColor(node.relationship_labels[0]) : '#6b7280')
                    const bgColor = dark ? '#1f2937' : '#ffffff'

                    ctx.beginPath()
                    ctx.arc(x, y, r, 0, 2 * Math.PI)
                    ctx.fillStyle = bgColor
                    ctx.fill()
                    ctx.strokeStyle = color
                    ctx.lineWidth = 2 / globalScale
                    ctx.stroke()

                    const emoji = node.avatar_emoji
                    if (emoji) {
                      ctx.font = `${r * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
                      ctx.textAlign = 'center'
                      ctx.textBaseline = 'middle'
                      ctx.fillText(emoji, x, y)
                    } else {
                      ctx.font = `bold ${r}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
                      ctx.textAlign = 'center'
                      ctx.textBaseline = 'middle'
                      ctx.fillStyle = color
                      ctx.fillText(node.name?.[0] || '?', x, y)
                    }

                    const fontSize = (node.__isCenter ? 10 : 9) / globalScale
                    ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'top'
                    ctx.fillStyle = dark ? '#e5e7eb' : '#1f2937'
                    ctx.fillText(node.name, x, y + r + 2 / globalScale)
                  }}
                  nodePointerAreaPaint={(node: MiniGraphNode, color: string, ctx: CanvasRenderingContext2D) => {
                    const x = node.x
                    const y = node.y
                    if (x == null || y == null) return
                    const r = node.__isCenter ? 14 : 10
                    ctx.beginPath()
                    ctx.arc(x, y, r, 0, 2 * Math.PI)
                    ctx.fillStyle = color
                    ctx.fill()
                  }}
                  width={graphDims.width}
                  height={graphDims.height}
                  backgroundColor={dark ? '#111827' : 'transparent'}
                  cooldownTicks={100}
                  onEngineStop={() => { if (fgRef.current) fgRef.current.zoomToFit(40, 20) }}
                />
                </Suspense>
              </CardContent>
            </Card>
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
                <span className="text-muted-foreground text-sm">{t('common.or')}</span>
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
                    <Upload className="h-4 w-4 mr-1" />{uploading ? '…' : t('contacts.uploadImage')}
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
                <Label htmlFor="edit-name">{t('contacts.name')}</Label>
                <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nickname">{t('contacts.nickname')}</Label>
                <Input id="edit-nickname" value={editForm.nickname} onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">{t('auth.email')}</Label>
                <Input id="edit-email" placeholder="email@example.com" spellCheck={false} value={editForm.emails.join(', ')} onChange={(e) => setEditForm({ ...editForm, emails: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">{t('contacts.phone')}</Label>
                <Input id="edit-phone" type="tel" value={editForm.phones.join(', ')} onChange={(e) => setEditForm({ ...editForm, phones: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-birthday">{t('contacts.birthday')}</Label>
              <Input id="edit-birthday" type="date" value={editForm.birthday} onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">{t('contacts.notes')}</Label>
              <Textarea id="edit-notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label id="edit-relationship-label">{t('contacts.relationship')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {presetLabelKeys.map((key) => {
                  const active = editForm.relationship_labels.includes(key)
                  return (
                    <Badge
                      key={key}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      aria-pressed={active}
                      render={
                        <button
                          type="button"
                          aria-labelledby="edit-relationship-label"
                          onClick={() => {
                            setEditForm({
                              ...editForm,
                              relationship_labels: active ? editForm.relationship_labels.filter((l) => l !== key) : [...editForm.relationship_labels, key],
                            })
                          }}
                        />
                      }
                    >
                      {t(`relationships.${key}`)}
                    </Badge>
                  )
                })}
              </div>
            </div>
            {allTags.length > 0 && (
              <div className="space-y-2">
                <Label id="edit-tags-label">{t('tags.title')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id)
                    return (
                      <Badge
                        key={tag.id}
                        variant={active ? 'default' : 'outline'}
                        className="cursor-pointer select-none"
                        style={active ? { backgroundColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                        aria-pressed={active}
                        render={
                          <button
                            type="button"
                            aria-labelledby="edit-tags-label"
                            onClick={() => {
                              setSelectedTagIds(active ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id])
                            }}
                          />
                        }
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
                <Label htmlFor="int-title">{t('contacts.title_field') || 'Title'}</Label>
                <Input id="int-title" value={intForm.title} onChange={(e) => setIntForm({ ...intForm, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label id="int-type-label">{t('common.type')}</Label>
                <div role="group" aria-labelledby="int-type-label" className="flex flex-wrap gap-1.5">
                  {interactionTypes.map((ty) => (
                    <Badge key={ty} variant={intForm.type === ty ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setIntForm({ ...intForm, type: ty })}>
                      {ty}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="int-content">{t('common.content')}</Label>
              <Textarea id="int-content" value={intForm.content} onChange={(e) => setIntForm({ ...intForm, content: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="int-date">{t('common.date')}</Label>
              <Input id="int-date" type="datetime-local" value={intForm.occurred_at} onChange={(e) => setIntForm({ ...intForm, occurred_at: e.target.value })} />
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
              <Label htmlFor="rem-title">{t('contacts.title_field') || 'Title'}</Label>
              <Input id="rem-title" value={remForm.title} onChange={(e) => setRemForm({ ...remForm, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rem-description">{t('common.description')}</Label>
              <Textarea id="rem-description" value={remForm.description} onChange={(e) => setRemForm({ ...remForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rem-remind-at">{t('common.remindAt')}</Label>
              <Input id="rem-remind-at" type="datetime-local" value={remForm.remind_at} onChange={(e) => setRemForm({ ...remForm, remind_at: e.target.value })} />
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
              <Label htmlFor="rel-type">{t('contacts.relationType')}</Label>
              <Input id="rel-type" value={relForm.relation_type} onChange={(e) => setRelForm({ ...relForm, relation_type: e.target.value })} placeholder={t('contacts.relationType')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelDialog(false)}>{t('contacts.cancel')}</Button>
            <Button onClick={handleSaveRel} disabled={relForm.contact_ids.length === 0}>{t('contacts.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('contacts.delete')}
        message={t('contacts.deleteConfirm')}
        confirmText={t('contacts.delete')}
        onConfirm={handleConfirmDeleteContact}
      />
    </div>
  )
}
