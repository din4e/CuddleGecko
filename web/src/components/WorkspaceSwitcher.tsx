import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../stores/workspace'
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
import { ChevronDown, Plus, Check } from 'lucide-react'

export default function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const { workspaces, currentWorkspace, loadWorkspaces, switchWorkspace, createWorkspace } = useWorkspaceStore()
  const [createOpen, setCreateOpen] = useState(false)
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

  const icon = currentWorkspace?.icon || '🏠'
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
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleSwitch(ws.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span className="text-base">{ws.icon || '🏠'}</span>
              <span className="flex-1 truncate">{ws.name}</span>
              {currentWorkspace?.id === ws.id && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </DropdownMenuItem>
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
              <Input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                placeholder="🏠"
                maxLength={2}
                className="w-20"
              />
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
    </>
  )
}
