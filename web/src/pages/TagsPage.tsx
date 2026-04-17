import { useEffect, useState } from 'react'
import { tagsApi } from '../api/tags'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import type { Tag } from '../types'
import { Plus, Trash2, Pencil } from 'lucide-react'

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')

  const loadTags = async () => {
    const res = await tagsApi.list()
    setTags(res.data)
  }

  useEffect(() => { loadTags() }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingTag) {
      await tagsApi.update(editingTag.id, { name, color })
    } else {
      await tagsApi.create({ name, color })
    }
    setDialogOpen(false)
    setEditingTag(null)
    setName('')
    setColor('#6366f1')
    loadTags()
  }

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag)
    setName(tag.name)
    setColor(tag.color || '#6366f1')
    setDialogOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (confirm('Delete this tag?')) {
      await tagsApi.delete(id)
      loadTags()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tags</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingTag(null) }}>
          <DialogTrigger>
            <Button><Plus className="h-4 w-4 mr-2" />New Tag</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingTag ? 'Edit Tag' : 'New Tag'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
                </div>
              </div>
              <Button type="submit" className="w-full">{editingTag ? 'Update' : 'Create'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tags.map((tag) => (
          <Card key={tag.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(tag)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(tag.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
      {tags.length === 0 && <p className="text-center text-muted-foreground py-12">No tags yet. Create one above.</p>}
    </div>
  )
}
