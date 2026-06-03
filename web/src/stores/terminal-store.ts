import { create } from 'zustand'

const HISTORY_KEY = 'terminal_history'
const MAX_HISTORY = 200

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch {
    // ignore storage errors
  }
}

interface TerminalState {
  history: string[]
  historyIndex: number
  isProcessing: boolean
  addHistory: (cmd: string) => void
  navigateHistory: (direction: 'up' | 'down') => string | undefined
  setProcessing: (v: boolean) => void
  resetHistoryIndex: () => void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  history: loadHistory(),
  historyIndex: -1,
  isProcessing: false,

  addHistory: (cmd) => {
    const trimmed = cmd.trim()
    if (!trimmed) return
    set((s) => {
      const history = [...s.history, trimmed]
      saveHistory(history)
      return { history, historyIndex: -1 }
    })
  },

  navigateHistory: (direction) => {
    const { history, historyIndex } = get()
    if (history.length === 0) return undefined

    let newIndex: number
    if (direction === 'up') {
      newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
    } else {
      if (historyIndex === -1) return undefined
      newIndex = historyIndex + 1
      if (newIndex >= history.length) {
        set({ historyIndex: -1 })
        return ''
      }
    }

    set({ historyIndex: newIndex })
    return history[newIndex]
  },

  setProcessing: (v) => set({ isProcessing: v }),
  resetHistoryIndex: () => set({ historyIndex: -1 }),
}))
