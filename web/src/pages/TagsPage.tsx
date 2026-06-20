import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import type { Tag } from '../types'
import { useViewMode } from '../hooks/useViewMode'
import ViewToggle from '../components/ViewToggle'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import EmptyState from '../components/EmptyState'
import ListPageHeader from '../components/ListPageHeader'
import {
  useTagsList,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
} from '../hooks/api/useTags'

export default function TagsPage() {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [view, setView] = useViewMode('tags')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const pageSize = 50

  const { data, isLoading } = useTagsList(page, pageSize)
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const tags = data?.items ?? []
  const total = data?.total ?? 0

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingTag) {
      await updateTag.mutateAsync({ id: editingTag.id, data: { name, color } })
    } else {
      await createTag.mutateAsync({ name, color })
    }
    setDialogOpen(false)
    setEditingTag(null)
    setName('')
    setColor('#6366f1')
  }

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag)
    setName(tag.name)
    setColor(tag.color || '#6366f1')
    setDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (deleteTarget === null) return
    await deleteTag.mutateAsync(deleteTarget)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('tags.title')}
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingTag(null) }}>
            <DialogTrigger>
              <Button><Plus className="h-4 w-4 mr-2" />{t('tags.newTag')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingTag ? t('tags.editTag') : t('tags.newTag')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tag-name">{t('tags.name')}</Label>
                  <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tag-color">{t('tags.color')}</Label>
                  <div className="flex gap-2 items-center">
                    <input id="tag-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer" />
                    <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createTag.isPending || updateTag.isPending}>
                  {editingTag ? t('tags.update') : t('tags.create')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      {isLoading ? (
        <EmptyState message="…" />
      ) : tags.length === 0 ? (
        <EmptyState message={t('tags.noTags')} />
      ) : view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <Card key={tag.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(tag)} aria-label={t('tags.editTag')}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(tag.id)} aria-label={t('tags.delete')}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Color</TableHead>
                <TableHead>{t('tags.name')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color }} />
                  </TableCell>
                  <TableCell className="font-medium">{tag.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(tag)} aria-label={t('tags.editTag')}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(tag.id)} aria-label={t('tags.delete')}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={t('tags.delete')}
        message={t('tags.deleteConfirm')}
        confirmText={t('tags.delete')}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
