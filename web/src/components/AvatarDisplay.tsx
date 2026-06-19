interface AvatarDisplayProps {
  emoji?: string
  imageUrl?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'h-8 w-8 text-sm', md: 'h-10 w-10 text-xl', lg: 'h-16 w-16 text-3xl' }

const sizePixels = { sm: 32, md: 40, lg: 64 }

export default function AvatarDisplay({ emoji, imageUrl, name, size = 'md' }: AvatarDisplayProps) {
  const px = sizePixels[size]
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={px}
        height={px}
        loading="lazy"
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
