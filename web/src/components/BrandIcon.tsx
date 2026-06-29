import { cn } from '@/lib/utils'

type BrandIconProps = {
  size?: number
  className?: string
}

/**
 * 品牌光栅图标：默认 icon.png（亮底），暗黑主题下切换为 icon_dark.png（暗底）。
 * 两张图叠放，靠 <html>.dark 的 dark:hidden / hidden dark:block 互斥显示，无需 JS。
 */
export default function BrandIcon({ size = 32, className = '' }: BrandIconProps) {
  return (
    <>
      <img
        src="/icon.png"
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 dark:hidden', className)}
      />
      <img
        src="/icon_dark.png"
        alt=""
        width={size}
        height={size}
        className={cn('hidden shrink-0 dark:block', className)}
      />
    </>
  )
}
