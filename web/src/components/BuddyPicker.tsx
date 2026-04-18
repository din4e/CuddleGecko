import { useState, useRef, useEffect } from 'react'
import { X, Plus, ChevronDown } from 'lucide-react'
import { contactsApi } from '../api/contacts'
import type { Contact } from '../types'

interface BuddyPickerProps {
  buddies: Contact[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  onBuddiesUpdate: (buddies: Contact[]) => void
  placeholder?: string
}

export default function BuddyPicker({ buddies, selectedIds, onChange, onBuddiesUpdate, placeholder = 'Search buddies...' }: BuddyPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [quickName, setQuickName] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setQuickName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = buddies.filter((b) => selectedIds.includes(b.id))
  const filtered = buddies
    .filter((b) => !selectedIds.includes(b.id))
    .filter((b) => !search || b.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20)

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id])
  }

  const handleQuickCreate = async () => {
    if (!quickName.trim()) return
    setCreating(true)
    try {
      const res = await contactsApi.create({ name: quickName.trim() })
      const newBuddy = res.data
      onBuddiesUpdate([...buddies, newBuddy])
      onChange([...selectedIds, newBuddy.id])
      setQuickName('')
      setSearch('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / Selected display */}
      <div
        className="flex min-h-[38px] flex-wrap items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-sm cursor-text"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
      >
        {selected.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium">
            {b.avatar_emoji && <span>{b.avatar_emoji}</span>}
            {b.name}
            <button
              type="button"
              className="ml-0.5 rounded-full hover:bg-primary/20"
              onClick={(e) => { e.stopPropagation(); toggle(b.id) }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {selected.length === 0 && !open && (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        {open && (
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[80px] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={selected.length > 0 ? 'Add more...' : placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !search && selected.length > 0) {
                toggle(selected[selected.length - 1].id)
              }
            }}
          />
        )}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {filtered.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer"
                  onClick={() => { toggle(b.id); setSearch('') }}
                >
                  <span>{b.avatar_emoji || '👤'}</span>
                  <span>{b.name}</span>
                  {b.emails?.length > 0 && (
                    <span className="text-xs text-muted-foreground truncate">{b.emails[0]}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
              {search ? 'No match found' : 'All buddies selected'}
            </div>
          )}

          {/* Quick create */}
          <div className="border-t px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Quick create..."
                className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickCreate() } }}
              />
              <button
                type="button"
                disabled={!quickName.trim() || creating}
                onClick={handleQuickCreate}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                {creating ? '...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
