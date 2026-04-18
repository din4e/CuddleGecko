import { LayoutGrid, List } from 'lucide-react'
import { Button } from './ui/button'
import type { ViewMode } from '../hooks/useViewMode'

export default function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex border rounded-md overflow-hidden">
      <Button
        variant={value === 'grid' ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onChange('grid')}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant={value === 'list' ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onChange('list')}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  )
}
