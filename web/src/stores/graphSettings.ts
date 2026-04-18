import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const defaults = { nodeRadius: 18, emojiSize: 28 }

interface GraphSettingsState {
  nodeRadius: number
  emojiSize: number
  setNodeRadius: (v: number) => void
  setEmojiSize: (v: number) => void
  reset: () => void
}

export const useGraphSettings = create<GraphSettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setNodeRadius: (v) => set({ nodeRadius: v }),
      setEmojiSize: (v) => set({ emojiSize: v }),
      reset: () => set(defaults),
    }),
    { name: 'graph-settings' }
  )
)
