import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { contactsApi } from '../api/contacts'
import { interactionsApi } from '../api/interactions'
import { remindersApi } from '../api/reminders'
import { relationsApi } from '../api/relations'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import type { Contact, Interaction, Reminder, ContactRelation } from '../types'
import { ArrowLeft, Mail, Phone, Calendar } from 'lucide-react'
import AvatarDisplay from '../components/AvatarDisplay'

const labelColors: Record<string, string> = {
  family: 'bg-pink-100 text-pink-800',
  friend: 'bg-green-100 text-green-800',
  colleague: 'bg-blue-100 text-blue-800',
  client: 'bg-purple-100 text-purple-800',
  pet: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function ContactDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [relations, setRelations] = useState<ContactRelation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const contactId = parseInt(id)
    setLoading(true)
    Promise.all([
      contactsApi.get(contactId),
      interactionsApi.list(contactId, { page: 1, page_size: 50 }),
      remindersApi.list(),
      relationsApi.list(contactId),
    ])
      .then(([contactRes, interactionsRes, remindersRes, relationsRes]) => {
        const c = contactRes.data
        const iData = interactionsRes.data
        const rData = remindersRes.data
        const relData = relationsRes.data
        setContact(c)
        setInteractions(iData.items || [])
        setReminders((Array.isArray(rData) ? rData : []).filter((r: Reminder) => r.contact_id === contactId))
        setRelations(Array.isArray(relData) ? relData : [])
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div>{t('dashboard.loading')}</div>
  if (!contact) return <div>{t('contacts.notFound')}</div>

  const handleDelete = async () => {
    if (confirm(t('contacts.deleteConfirm'))) {
      await contactsApi.delete(contact.id)
      navigate('/contacts')
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/contacts')}>
        <ArrowLeft className="h-4 w-4 mr-2" />{t('contacts.backToContacts')}
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <AvatarDisplay
                emoji={contact.avatar_emoji}
                imageUrl={contact.avatar_url}
                name={contact.name}
                size="lg"
              />
              <div>
                <CardTitle className="text-2xl">{contact.name}</CardTitle>
                {contact.nickname && <p className="text-muted-foreground">{contact.nickname}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDelete}>{t('contacts.delete')}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {contact.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" />{contact.email}</div>}
            {contact.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{contact.phone}</div>}
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
              {contact.tags.map((t) => (
                <Badge key={t.id} variant="outline" style={{ borderColor: t.color, color: t.color }}>{t.name}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="interactions">
        <TabsList>
          <TabsTrigger value="interactions">{t('contacts.interactionsTab')} ({interactions.length})</TabsTrigger>
          <TabsTrigger value="reminders">{t('contacts.remindersTab')} ({reminders.length})</TabsTrigger>
          <TabsTrigger value="relations">{t('contacts.relationsTab')} ({relations.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="interactions" className="mt-4">
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
                      <span className="text-sm text-muted-foreground">{new Date(i.occurred_at).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="reminders" className="mt-4">
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
                    <div className="text-right">
                      <Badge variant={r.status === 'pending' ? 'default' : 'secondary'}>{r.status}</Badge>
                      <div className="text-sm text-muted-foreground mt-1">{new Date(r.remind_at).toLocaleDateString()}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="relations" className="mt-4">
          {relations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('contacts.noRelations')}</p>
          ) : (
            <div className="space-y-3">
              {relations.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{t('contacts.relatedTo')} #{r.contact_id_a === contact!.id ? r.contact_id_b : r.contact_id_a}</span>
                      <Badge variant="outline">{r.relation_type || t('contacts.connected')}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
