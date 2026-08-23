import { useCallback, useEffect, useState } from 'react'
import { settingsApi, type KanbanColumn } from '../../api/settings'
import { DEFAULT_KANBAN_COLUMNS } from '../../lib/kanban'

/**
 * Kanban column layout, persisted per user via /settings/kanban. Kept as
 * plain state (not TanStack cache): the board edits it locally on every
 * add/remove and saves fire-and-forget.
 */
export function useKanbanColumns() {
  const [columns, setColumns] = useState<KanbanColumn[]>(DEFAULT_KANBAN_COLUMNS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    settingsApi
      .getKanban()
      .then((columns) => {
        if (alive && Array.isArray(columns) && columns.length > 0) setColumns(columns)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  const persist = useCallback((next: KanbanColumn[]) => {
    setColumns(next)
    void settingsApi.updateKanban({ columns: next }).catch(() => {})
  }, [])

  const addColumn = useCallback((col: KanbanColumn) => {
    setColumns((prev) => {
      const next = [...prev, col]
      void settingsApi.updateKanban({ columns: next }).catch(() => {})
      return next
    })
  }, [])

  const removeColumn = useCallback((id: string) => {
    setColumns((prev) => {
      const next = prev.filter((c) => c.id !== id)
      void settingsApi.updateKanban({ columns: next }).catch(() => {})
      return next
    })
  }, [])

  return { columns, loaded, addColumn, removeColumn, setColumns: persist }
}
