import { create } from 'zustand'
import { createHTTPAdapters } from '@/api/http-adapter'
import type { AppAdapters } from '@/api/adapter'
import { isWailsRuntime } from '@/lib/wails'

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

const isWails = isWailsRuntime()

const savedMode = (localStorage.getItem('app_mode') as AppMode) || (isWails ? 'local' : 'remote')
const savedUrl = localStorage.getItem('remote_url') || 'http://localhost:8080'

let httpAdapters: AppAdapters | null = null

function getHTTPAdapters(): AppAdapters {
  if (!httpAdapters) {
    httpAdapters = createHTTPAdapters()
  }
  return httpAdapters
}

function getInitialAdapters(): AppAdapters | null {
  if (savedMode === 'remote' || !isWails) {
    return getHTTPAdapters()
  }
  return null
}

export const useModeStore = create<ModeState>((set, get) => ({
  mode: savedMode,
  remoteUrl: savedUrl,
  adapters: getInitialAdapters(),
  adaptersLoading: false,

  setMode: (mode) => {
    localStorage.setItem('app_mode', mode)
    if (mode === 'remote' || !isWails) {
      set({ mode, adapters: getHTTPAdapters(), adaptersLoading: false })
    } else {
      set({ mode, adapters: null, adaptersLoading: false })
      get().initAdapters()
    }
  },

  setRemoteUrl: (url) => {
    localStorage.setItem('remote_url', url)
    set({ remoteUrl: url })
  },

  initAdapters: async () => {
    const mode = get().mode
    set({ adaptersLoading: true })

    try {
      if (mode === 'local' && isWails) {
        const { createWailsAdapters } = await import('@/api/wails-adapter')
        const adapters = await createWailsAdapters()
        set({ adapters, adaptersLoading: false })
      } else {
        set({ adapters: getHTTPAdapters(), adaptersLoading: false })
      }
    } catch {
      set({ adapters: getHTTPAdapters(), adaptersLoading: false })
    }
  },
}))
