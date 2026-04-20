import { useState, useEffect } from 'react'

export type ViewMode = 'grid' | 'list'

export function useViewMode(pageKey: string): [ViewMode, (mode: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(`view-${pageKey}`)
    if (saved === 'grid' || saved === 'list') return saved
    return window.innerWidth < 768 ? 'grid' : 'list'
  })

  useEffect(() => {
    localStorage.setItem(`view-${pageKey}`, view)
  }, [pageKey, view])

  return [view, setView]
}
