import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from './ui/input'

// Group labels resolve through t(`emoji.groups.${key}`) — kept as key ids,
// not display text.
const emojiGroups: { key: string; emojis: string[] }[] = [
  { key: 'frequently', emojis: ['🏠', '💼', '🏢', '📚', '🎯', '⭐', '📌', '🔑', '💡', '🔧', '⚙️', '🛠️', '📊', '📈', '🗂️', '📁'] },
  { key: 'face', emojis: ['😊', '😄', '😎', '🥰', '😌', '🙃', '😇', '🤗', '😋', '🤩', '😃', '😁'] },
  { key: 'animal', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦜', '🐤', '🐢', '🐍', '🦎', '🐙', '🐠', '🐟', '🐬', '🐳', '🦋', '🐛', '🐝', '🐞'] },
  { key: 'nature', emojis: ['🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🌲', '🌴', '🌵', '🍁', '🍂'] },
  { key: 'food', emojis: ['🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🥝', '🍌', '🍰', '🎂', '🍪'] },
  { key: 'object', emojis: ['⭐', '🌟', '💫', '❤️', '💕', '🎵', '🎨', '📱', '💻', '🚗', '✈️'] },
  { key: 'symbol', emojis: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚪', '⚫', '🔶', '🔷', '♈', '♉', '♊', '♋', '♌', '♍'] },
]

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
}

export default function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-xl hover:border-primary transition-colors shrink-0"
        >
          {value || '😊'}
        </button>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('emoji.placeholder')}
          maxLength={4}
          className="w-24 h-10"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-muted-foreground hover:text-destructive shrink-0"
          >
            {t('common.clear')}
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-12 left-0 z-50 bg-popover border rounded-lg shadow-lg p-3 w-72 max-h-64 overflow-y-auto">
          {emojiGroups.map((group) => (
            <div key={group.key} className="mb-2">
              <div className="text-xs text-muted-foreground mb-1">{t(`emoji.groups.${group.key}`)}</div>
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
