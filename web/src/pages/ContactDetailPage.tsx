import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

export default function ContactDetailPage() {
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

  if (loading) return <div>Loading...</div>
  if (!contact) return <div>Contact not found</div>

  const handleDelete = async () => {
    if (confirm('Delete this contact?')) {
      await contactsApi.delete(contact.id)
      navigate('/contacts')
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/contacts')}>
        <ArrowLeft className="h-4 w-4 mr-2" />Back to Contacts
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{contact.name}</CardTitle>
              {contact.nickname && <p className="text-muted-foreground">{contact.nickname}</p>}
            </div>
            <div className="flex gap-2">
              <Badge>{contact.relationship_type}</Badge>
              <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
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
          <TabsTrigger value="interactions">Interactions ({interactions.length})</TabsTrigger>
          <TabsTrigger value="reminders">Reminders ({reminders.length})</TabsTrigger>
          <TabsTrigger value="relations">Relations ({relations.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="interactions" className="mt-4">
          {interactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No interactions recorded</p>
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
            <p className="text-muted-foreground text-center py-8">No reminders</p>
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
            <p className="text-muted-foreground text-center py-8">No relations</p>
          ) : (
            <div className="space-y-3">
              {relations.map((r) => (
                <Card key={r.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Related to contact #{r.contact_id_a === contact!.id ? r.contact_id_b : r.contact_id_a}</span>
                      <Badge variant="outline">{r.relation_type || 'connected'}</Badge>
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
