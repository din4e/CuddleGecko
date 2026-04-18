import { useId } from 'react'
import { cn } from '@/lib/utils'

type GeckoIconProps = {
  className?: string
  size?: number
  /** 登录等大图：腮红 + 更弯的笑 */
  cute?: boolean
}

/**
 * 品牌壁虎标：统一矢量，随主题 primary / foreground 变化。
 */
export default function GeckoIcon({ className = '', size = 32, cute = false }: GeckoIconProps) {
  const rawId = useId()
  const fid = `gecko-${rawId.replace(/:/g, '')}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 overflow-visible', className)}
      aria-hidden
    >
      <defs>
        <filter id={fid} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.14" />
        </filter>
      </defs>

      <g filter={`url(#${fid})`}>
        {/* tail — drawn first, behind body */}
        <path
          d="M46 40 C52 44 54 52 48 58 C42 60 36 56 34 50"
          className="stroke-primary"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />

        {/* ear bumps */}
        <circle cx="21" cy="17" r="5.5" className="fill-primary" />
        <circle cx="43" cy="17" r="5.5" className="fill-primary" />

        {/* head + body */}
        <ellipse cx="32" cy="21" rx="12" ry="10" className="fill-primary" />
        <ellipse cx="32" cy="36" rx="15" ry="17" className="fill-primary" />

        {/* belly */}
        <ellipse cx="32" cy="38" rx="9" ry="11" className="fill-primary-foreground/22" />

        {/* legs — short capsules */}
        <ellipse cx="17" cy="41" rx="4" ry="3.2" className="fill-primary" transform="rotate(-25 17 41)" />
        <ellipse cx="47" cy="41" rx="4" ry="3.2" className="fill-primary" transform="rotate(25 47 41)" />
        <ellipse cx="22" cy="48" rx="3.8" ry="3" className="fill-primary" transform="rotate(-8 22 48)" />
        <ellipse cx="42" cy="48" rx="3.8" ry="3" className="fill-primary" transform="rotate(8 42 48)" />

        {/* toes */}
        <circle cx="14" cy="43" r="2" className="fill-primary" />
        <circle cx="50" cy="43" r="2" className="fill-primary" />
        <circle cx="19" cy="51" r="1.8" className="fill-primary" />
        <circle cx="45" cy="51" r="1.8" className="fill-primary" />

        {/* eyes */}
        <ellipse cx="26" cy="19" rx="4.2" ry="4.8" className="fill-background" />
        <ellipse cx="38" cy="19" rx="4.2" ry="4.8" className="fill-background" />
        <circle cx="27.2" cy="18.2" r="2.2" className="fill-foreground" />
        <circle cx="39.2" cy="18.2" r="2.2" className="fill-foreground" />
        <circle cx="28.4" cy="17" r="0.9" className="fill-background" />
        <circle cx="40.4" cy="17" r="0.9" className="fill-background" />

        {/* smile */}
        <path
          d={cute ? 'M25.5 24.5 Q32 30.5 38.5 24.5' : 'M27 25 Q32 28.5 37 25'}
          className={cute ? 'stroke-foreground/50' : 'stroke-foreground/40'}
          strokeWidth={cute ? '1.5' : '1.4'}
          strokeLinecap="round"
          fill="none"
        />

        {cute && (
          <>
            <ellipse cx="22" cy="23" rx="3.2" ry="2.2" className="fill-rose-400/45 dark:fill-rose-300/35" />
            <ellipse cx="42" cy="23" rx="3.2" ry="2.2" className="fill-rose-400/45 dark:fill-rose-300/35" />
          </>
        )}
      </g>
    </svg>
  )
}
