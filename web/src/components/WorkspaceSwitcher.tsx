import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../stores/workspace'
import type { Workspace } from '../types'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ChevronDown, Plus, Check, Pencil } from 'lucide-react'
import EmojiPicker from './EmojiPicker'

export default function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const { workspaces, currentWorkspace, loadWorkspaces, switchWorkspace, createWorkspace, updateWorkspace } = useWorkspaceStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Workspace | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const handleSwitch = async (id: number) => {
    await switchWorkspace(id)
    window.location.reload()
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const ws = await createWorkspace(newName.trim(), '', newIcon.trim() || undefined)
      setCreateOpen(false)
      setNewName('')
      setNewIcon('')
      await switchWorkspace(ws.id)
      window.location.reload()
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (ws: Workspace) => {
    setEditTarget(ws)
    setEditName(ws.name)
    setEditIcon(ws.icon || '')
    setEditOpen(true)
  }

  const handleEditSave = async () => {
    if (!editTarget || !editName.trim()) return
    setSaving(true)
    try {
      await updateWorkspace(editTarget.id, {
        name: editName.trim(),
        icon: editIcon.trim(),
      })
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const getWsIcon = (name: string, icon?: string) => icon || name.charAt(0).toUpperCase()

  const icon = currentWorkspace ? getWsIcon(currentWorkspace.name, currentWorkspace.icon) : ''
  const name = currentWorkspace?.name || t('workspace.default', '默认空间')

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 px-2 text-sm font-normal"
            aria-label={t('workspace.switch', '切换空间')}
          >
            <span className="text-base leading-none">{icon}</span>
            <span className="truncate flex-1 text-left">{name}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 p-1">
          {workspaces.map((ws) => (
            <div key={ws.id} className="group flex items-center rounded-sm hover:bg-accent">
              <button
                className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-left cursor-pointer bg-transparent border-none"
                onClick={() => handleSwitch(ws.id)}
              >
                <span className="text-base">{getWsIcon(ws.name, ws.icon)}</span>
                <span className="flex-1 truncate">{ws.name}</span>
                {currentWorkspace?.id === ws.id && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </button>
              <button
                className="p-1 mr-1 rounded opacity-40 hover:opacity-100 cursor-pointer bg-transparent border-none"
                onClick={() => openEdit(ws)}
                aria-label={t('workspace.rename', '重命名')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="cursor-pointer">
            <Plus className="mr-1.5 h-4 w-4" />
            {t('workspace.create', '新建空间')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workspace.create', '新建空间')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('workspace.icon', '图标')}</Label>
              <EmojiPicker value={newIcon} onChange={setNewIcon} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('workspace.name', '名称')}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('workspace.namePlaceholder', '例如：工作、个人')}
                maxLength={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel', '取消')}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {t('common.create', '创建')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workspace.rename', '重命名')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('workspace.icon', '图标')}</Label>
              <EmojiPicker value={editIcon} onChange={setEditIcon} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('workspace.name', '名称')}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.cancel', '取消')}
            </Button>
            <Button onClick={handleEditSave} disabled={!editName.trim() || saving}>
              {t('common.save', '保存')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
