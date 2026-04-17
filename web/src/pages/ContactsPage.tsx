import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contactsApi } from '../api/contacts'

import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import type { Contact, RelationshipType } from '../types'
import { Plus, Search } from 'lucide-react'

const relationshipLabels: Record<string, string> = {
  family: 'Family', friend: 'Friend', colleague: 'Colleague', client: 'Client', other: 'Other',
}

const relationshipColors: Record<string, string> = {
  family: 'bg-pink-100 text-pink-800',
  friend: 'bg-green-100 text-green-800',
  colleague: 'bg-blue-100 text-blue-800',
  client: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', relationship_type: 'other' as RelationshipType })

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await contactsApi.create(newContact)
    setDialogOpen(false)
    setNewContact({ name: '', email: '', phone: '', relationship_type: 'other' })
    loadContacts()
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button><Plus className="h-4 w-4 mr-2" />Add Contact</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={newContact.relationship_type} onValueChange={(v) => setNewContact({ ...newContact, relationship_type: v as Contact['relationship_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(relationshipLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create Contact</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No contacts found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <Link key={contact.id} to={`/contacts/${contact.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-semibold">
                      {contact.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{contact.name}</div>
                      {contact.email && <div className="text-sm text-muted-foreground truncate">{contact.email}</div>}
                    </div>
                    <Badge variant="secondary" className={relationshipColors[contact.relationship_type] || ''}>
                      {relationshipLabels[contact.relationship_type] || contact.relationship_type}
                    </Badge>
                  </div>
                  {contact.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {contact.tags.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-xs" style={{ borderColor: t.color, color: t.color }}>
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
