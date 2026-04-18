import { useState } from 'react'

const emojiGroups = [
  { label: '表情', emojis: ['😊', '😄', '😎', '🥰', '😌', '🙃', '😇', '🤗', '😋', '🤩', '😃', '😁'] },
  { label: '动物', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦜', '🐤', '🐢', '🐍', '🦎', '🐙', '🐠', '🐟', '🐬', '🐳', '🦋', '🐛', '🐝', '🐞'] },
  { label: '自然', emojis: ['🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🌲', '🌴', '🌵', '🍁', '🍂'] },
  { label: '食物', emojis: ['🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🥝', '🍌', '🍰', '🎂', '🍪'] },
  { label: '物品', emojis: ['⭐', '🌟', '💫', '❤️', '💕', '🎵', '🎨', '📱', '💻', '🏠', '🚗', '✈️'] },
]

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
}

export default function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-xl hover:border-primary transition-colors"
        >
          {value || '😊'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            清除
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-12 left-0 z-50 bg-popover border rounded-lg shadow-lg p-3 w-72 max-h-64 overflow-y-auto">
          {emojiGroups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="text-xs text-muted-foreground mb-1">{group.label}</div>
              <div className="flex flex-wrap gap-1">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { onChange(emoji); setOpen(false) }}
                    className={`h-8 w-8 rounded hover:bg-muted flex items-center justify-center text-lg transition-colors ${value === emoji ? 'bg-primary/20 ring-1 ring-primary' : ''}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
