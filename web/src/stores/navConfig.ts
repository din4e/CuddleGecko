import { create } from 'zustand'
import { settingsApi, type NavConfig } from '../api/settings'
import { DEFAULT_NAV_ORDER } from '../lib/nav'

interface NavConfigState {
  order: string[]
  hidden: string[]
  loaded: boolean
  load: () => Promise<void>
  setConfig: (cfg: NavConfig) => void
}

// Sidebar nav layout (per-user, fetched from backend in web mode).
export const useNavConfigStore = create<NavConfigState>((set) => ({
  order: DEFAULT_NAV_ORDER,
  hidden: [],
  loaded: false,
  load: async () => {
    try {
      const cfg = await settingsApi.getNav()
      set({
        order: cfg.order && cfg.order.length ? cfg.order : DEFAULT_NAV_ORDER,
        hidden: cfg.hidden || [],
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },
  setConfig: (cfg) => set({ order: cfg.order, hidden: cfg.hidden }),
}))
