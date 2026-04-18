import { useState, useEffect } from 'react'

export type ViewMode = 'grid' | 'list'

export function useViewMode(pageKey: string): [ViewMode, (mode: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(`view-${pageKey}`)
    return (saved === 'grid' || saved === 'list') ? saved : 'grid'
  })

  useEffect(() => {
    localStorage.setItem(`view-${pageKey}`, view)
  }, [pageKey, view])

  return [view, setView]
}
