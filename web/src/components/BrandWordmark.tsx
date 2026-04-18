import { cn } from '@/lib/utils'

/** Splits *Gecko into [prefix, gecko] for product wordmark; otherwise returns null. */
function splitGeckoSuffix(label: string): readonly [string, string] | null {
  const trimmed = label.trim()
  const m = /^(.*)(gecko)$/i.exec(trimmed)
  if (!m) return null
  const head = m[1]
  if (!head) return null
  return [head, m[2]] as const
}

type BrandWordmarkProps = {
  label: string
  className?: string
  /** 侧栏等小宽度：更小字号、左对齐、单行省略需配合外层 min-w-0 */
  compact?: boolean
  align?: 'center' | 'start'
}

/**
 * Auth / marketing标题或侧栏品牌：可选 *Gecko 分色。
 */
export function BrandWordmark({ label, className, compact = false, align = 'center' }: BrandWordmarkProps) {
  const parts = splitGeckoSuffix(label)
  const sizeCls = compact
    ? 'text-lg leading-tight sm:text-lg'
    : 'text-[1.625rem] leading-none sm:text-[1.75rem]'
  const alignCls = align === 'start' ? 'justify-start' : 'justify-center'

  const tightSidebar = compact && align === 'start'

  if (!parts) {
    return (
      <span
        className={cn(
          'font-brand inline-block font-semibold tracking-tight text-foreground',
          sizeCls,
          tightSidebar && 'min-w-0 truncate',
          className
        )}
      >
        {label}
      </span>
    )
  }

  const [head, tail] = parts

  return (
    <span
      className={cn(
        'font-brand inline-flex items-baseline gap-0',
        tightSidebar ? 'min-w-0 flex-nowrap overflow-hidden whitespace-nowrap' : 'flex-wrap',
        alignCls,
        sizeCls,
        className
      )}
    >
      <span className="font-medium text-foreground/80">{head}</span>
      <span className="font-semibold text-primary">{tail}</span>
    </span>
  )
}
