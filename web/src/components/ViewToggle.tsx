import { LayoutGrid, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import type { ViewMode } from '../hooks/useViewMode'

export default function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex border rounded-md overflow-hidden">
      <Button
        variant={value === 'grid' ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onChange('grid')}
        aria-label={t('common.gridView')}
        aria-pressed={value === 'grid'}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant={value === 'list' ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onChange('list')}
        aria-label={t('common.listView')}
        aria-pressed={value === 'list'}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  )
}
