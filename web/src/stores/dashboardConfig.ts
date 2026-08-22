import { create } from 'zustand'
import { settingsApi } from '../api/settings'
import { DEFAULT_DASHBOARD_ORDER } from '../lib/dashboard'

interface DashboardConfigState {
  order: string[]
  hidden: string[]
  loaded: boolean
  load: () => Promise<void>
  save: (order: string[], hidden: string[]) => Promise<void>
}

// Dashboard widget layout (per-user, fetched from backend in web mode). Mirrors useNavConfigStore.
export const useDashboardConfigStore = create<DashboardConfigState>((set) => ({
  order: DEFAULT_DASHBOARD_ORDER,
  hidden: [],
  loaded: false,
  load: async () => {
    try {
      const cfg = await settingsApi.getDashboard()
      // Merge any newly-added default widgets into a saved order so they still appear
      // for users who customized the dashboard before the widget existed.
      const saved = cfg.order && cfg.order.length ? cfg.order : DEFAULT_DASHBOARD_ORDER
      const merged = [...saved, ...DEFAULT_DASHBOARD_ORDER.filter((id) => !saved.includes(id))]
      set({
        order: merged,
        hidden: cfg.hidden || [],
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },
  save: async (order, hidden) => {
    set({ order, hidden })
    try {
      await settingsApi.updateDashboard({ order, hidden })
    } catch {
      // persist best-effort; local state already updated
    }
  },
}))
