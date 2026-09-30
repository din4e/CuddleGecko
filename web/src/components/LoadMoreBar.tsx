import { useTranslation } from 'react-i18next'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from './ui/button'

interface LoadMoreBarProps {
  loaded: number
  total: number
  loading: boolean
  onMore: () => void
}

/** "Load more" bar shared by every todo view (timeline / grouped / kanban /
 *  tree roots). Hidden once everything is loaded. */
export default function LoadMoreBar({ loaded, total, loading, onMore }: LoadMoreBarProps) {
  const { t } = useTranslation()
  if (loaded >= total) return null
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <Button variant="outline" size="sm" onClick={onMore} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ChevronDown className="h-4 w-4 mr-1" />}
        {t('todos.loadMore')}
      </Button>
      <span className="text-xs text-muted-foreground">{t('todos.loadedCount', { loaded, total })}</span>
    </div>
  )
}
