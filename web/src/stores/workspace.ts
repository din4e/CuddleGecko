import { create } from 'zustand'
import { useModeStore } from './mode'
import type { Workspace } from '../types'

function getWorkspaceAdapter() {
  const adapters = useModeStore.getState().adapters
  if (!adapters?.workspace) throw new Error('Workspace adapter not available')
  return adapters.workspace
}

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  isLoading: boolean
  loadWorkspaces: () => Promise<void>
  switchWorkspace: (id: number) => Promise<void>
  createWorkspace: (name: string, description?: string, icon?: string) => Promise<Workspace>
  deleteWorkspace: (id: number) => Promise<void>
  initDefault: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  isLoading: false,

  loadWorkspaces: async () => {
    set({ isLoading: true })
    try {
      const workspace = getWorkspaceAdapter()
      const workspaces = await workspace.list()
      const savedId = localStorage.getItem('current_workspace_id')
      const current = workspaces.find((ws) => ws.id === Number(savedId)) || workspaces[0] || null
      if (current) {
        localStorage.setItem('current_workspace_id', String(current.id))
      }
      set({ workspaces, currentWorkspace: current })
    } finally {
      set({ isLoading: false })
    }
  },

  switchWorkspace: async (id) => {
    const workspace = getWorkspaceAdapter()
    const ws = await workspace.switch(id)
    localStorage.setItem('current_workspace_id', String(ws.id))
    set({ currentWorkspace: ws })
  },

  createWorkspace: async (name, description, icon) => {
    const workspace = getWorkspaceAdapter()
    const ws = await workspace.create({ name, description: description || '', icon: icon || '' })
    set((state) => ({ workspaces: [...state.workspaces, ws] }))
    return ws
  },

  deleteWorkspace: async (id) => {
    const workspace = getWorkspaceAdapter()
    await workspace.delete(id)
    const { loadWorkspaces } = get()
    await loadWorkspaces()
  },

  initDefault: async () => {
    const savedId = localStorage.getItem('current_workspace_id')
    if (savedId) return
    try {
      const workspace = getWorkspaceAdapter()
      const ws = await workspace.getDefault()
      localStorage.setItem('current_workspace_id', String(ws.id))
      set({ currentWorkspace: ws })
    } catch {
      // no default workspace yet
    }
  },
}))
