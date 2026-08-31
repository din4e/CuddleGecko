import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { settingsApi } from '../api/settings'

export type GraphLayoutMode = 'force' | 'cluster' | 'random'

// Physics defaults mirror d3-force (link distance 30, charge -30) so the
// force layout behaves exactly as before the settings existed. Keep in sync
// with handler.defaultGraphConfig (internal/handler/user_setting.go).
export const GRAPH_SETTINGS_DEFAULTS = {
  nodeRadius: 18,
  emojiSize: 28,
  showLabels: true,
  showSelf: true,
  layoutMode: 'force' as GraphLayoutMode,
  linkDistance: 30,
  chargeStrength: 30,
}

interface GraphSettingsState {
  nodeRadius: number
  emojiSize: number
  showLabels: boolean
  showSelf: boolean
  layoutMode: GraphLayoutMode
  linkDistance: number
  chargeStrength: number
  loaded: boolean
  setNodeRadius: (v: number) => void
  setEmojiSize: (v: number) => void
  setShowLabels: (v: boolean) => void
  setShowSelf: (v: boolean) => void
  setLayoutMode: (v: GraphLayoutMode) => void
  setLinkDistance: (v: number) => void
  setChargeStrength: (v: number) => void
  reset: () => void
  load: () => Promise<void>
}

// Debounced server sync: slider drags fire dozens of updates; only the last
// state hits the API. localStorage (zustand persist) stays the instant layer,
// so a failed push loses nothing.
let saveTimer: ReturnType<typeof setTimeout> | null = null

function queueServerSave() {
  if (saveTimer != null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const s = useGraphSettings.getState()
    settingsApi
      .updateGraph({
        nodeRadius: s.nodeRadius,
        emojiSize: s.emojiSize,
        showLabels: s.showLabels,
        showSelf: s.showSelf,
        layoutMode: s.layoutMode,
        linkDistance: s.linkDistance,
        chargeStrength: s.chargeStrength,
      })
      .catch(() => {
        /* best-effort: the localStorage copy still holds the value */
      })
  }, 600)
}

export const useGraphSettings = create<GraphSettingsState>()(
  persist(
    (set) => ({
      ...GRAPH_SETTINGS_DEFAULTS,
      loaded: false,
      setNodeRadius: (v) => {
        set({ nodeRadius: v })
        queueServerSave()
      },
      setEmojiSize: (v) => {
        set({ emojiSize: v })
        queueServerSave()
      },
      setShowLabels: (v) => {
        set({ showLabels: v })
        queueServerSave()
      },
      setShowSelf: (v) => {
        set({ showSelf: v })
        queueServerSave()
      },
      setLayoutMode: (v) => {
        set({ layoutMode: v })
        queueServerSave()
      },
      setLinkDistance: (v) => {
        set({ linkDistance: v })
        queueServerSave()
      },
      setChargeStrength: (v) => {
        set({ chargeStrength: v })
        queueServerSave()
      },
      reset: () => {
        set({ ...GRAPH_SETTINGS_DEFAULTS })
        queueServerSave()
      },
      load: async () => {
        // A pending debounced save means local state is newer than the
        // server's — don't clobber it with stale server values.
        if (saveTimer != null) return
        try {
          const cfg = await settingsApi.getGraph()
          useGraphSettings.setState({ ...cfg, loaded: true })
        } catch {
          useGraphSettings.setState({ loaded: true })
        }
      },
    }),
    {
      name: 'graph-settings',
      // Persist only the settings themselves, not the loaded flag.
      partialize: (s) => ({
        nodeRadius: s.nodeRadius,
        emojiSize: s.emojiSize,
        showLabels: s.showLabels,
        showSelf: s.showSelf,
        layoutMode: s.layoutMode,
        linkDistance: s.linkDistance,
        chargeStrength: s.chargeStrength,
      }),
    }
  )
)
