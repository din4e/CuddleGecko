import { create } from 'zustand'
import { createHTTPAdapters } from '@/api/http-adapter'
import type { AppAdapters } from '@/api/adapter'

// Web-only build (the Wails desktop client lives in the separate
// CuddleGeckoDesktop repo since commit 03a8f82): there is exactly one adapter
// implementation — HTTP — created once and shared. The old local/remote mode
// switching, remoteUrl, and initAdapters machinery had zero callers and was
// removed; consumers subscribe to `adapters` only.
interface ModeState {
  adapters: AppAdapters
}

let httpAdapters: AppAdapters | null = null
function getHTTPAdapters(): AppAdapters {
  if (!httpAdapters) httpAdapters = createHTTPAdapters()
  return httpAdapters
}

export const useModeStore = create<ModeState>(() => ({
  adapters: getHTTPAdapters(),
}))
