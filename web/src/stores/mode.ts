import { create } from 'zustand'
import { createHTTPAdapters } from '@/api/http-adapter'
import type { AppAdapters } from '@/api/adapter'

type AppMode = 'local' | 'remote'

interface ModeState {
  mode: AppMode
  remoteUrl: string
  adapters: AppAdapters | null
  adaptersLoading: boolean
  setMode: (mode: AppMode) => void
  setRemoteUrl: (url: string) => void
  initAdapters: () => Promise<void>
}

const savedUrl = localStorage.getItem('remote_url') || 'http://localhost:8080'

let httpAdapters: AppAdapters | null = null
function getHTTPAdapters(): AppAdapters {
  if (!httpAdapters) httpAdapters = createHTTPAdapters()
  return httpAdapters
}

// Web-only build: always uses the HTTP adapter (no local Wails mode).
export const useModeStore = create<ModeState>((set) => ({
  mode: 'remote',
  remoteUrl: savedUrl,
  adapters: getHTTPAdapters(),
  adaptersLoading: false,

  setMode: (mode) => {
    localStorage.setItem('app_mode', mode)
    set({ mode, adapters: getHTTPAdapters(), adaptersLoading: false })
  },
  setRemoteUrl: (url) => {
    localStorage.setItem('remote_url', url)
    set({ remoteUrl: url })
  },
  initAdapters: async () => {
    set({ adapters: getHTTPAdapters(), adaptersLoading: false })
  },
}))
