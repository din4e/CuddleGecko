interface AvatarDisplayProps {
  emoji?: string
  imageUrl?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'h-8 w-8 text-sm', md: 'h-10 w-10 text-xl', lg: 'h-16 w-16 text-3xl' }

export default function AvatarDisplay({ emoji, imageUrl, name, size = 'md' }: AvatarDisplayProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover`}
      />
    )
  }
  if (emoji) {
    return (
      <div className={`${sizes[size]} rounded-full bg-muted flex items-center justify-center`}>
        {emoji}
      </div>
    )
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-muted flex items-center justify-center font-semibold`}>
      {name?.[0] || '?'}
    </div>
  )
}
