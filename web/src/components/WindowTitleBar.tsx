import { useState, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import GeckoIcon from './GeckoIcon'

export default function WindowTitleBar() {
  const isWails = typeof window !== 'undefined' && !!(window as any).__WAILS__
  const [maximised, setMaximised] = useState(false)

  useEffect(() => {
    if (!isWails) return
    ;(async () => {
      const { WindowIsMaximised } = await import('@/wailsjs/runtime/runtime')
      setMaximised(await WindowIsMaximised())
    })()
  }, [isWails])

  const minimise = useCallback(async () => {
    const { WindowMinimise } = await import('@/wailsjs/runtime/runtime')
    WindowMinimise()
  }, [])

  const toggleMaximise = useCallback(async () => {
    const { WindowToggleMaximise } = await import('@/wailsjs/runtime/runtime')
    await WindowToggleMaximise()
    const { WindowIsMaximised } = await import('@/wailsjs/runtime/runtime')
    setMaximised(await WindowIsMaximised())
  }, [])

  const quit = useCallback(async () => {
    const { Quit } = await import('@/wailsjs/runtime/runtime')
    Quit()
  }, [])

  const handleDoubleClick = useCallback(async () => {
    await toggleMaximise()
  }, [toggleMaximise])

  if (!isWails) return null

  return (
    <div
      className="flex h-10 shrink-0 items-center bg-card border-b select-none"
      style={{ '--wails-drag': 'drag' } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-2.5 pl-4">
        <GeckoIcon size={20} />
        <span className="text-[13px] font-semibold tracking-tight text-foreground">CuddleGecko</span>
      </div>
      <div className="ml-auto flex" style={{ '--wails-drag': 'no-drag' } as React.CSSProperties}>
        {/* Minimise */}
        <button
          onClick={minimise}
          className="inline-flex size-10 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Minimise"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" className="fill-current">
            <rect width="10" height="1" />
          </svg>
        </button>
        {/* Maximise / Restore */}
        <button
          onClick={toggleMaximise}
          className="inline-flex size-10 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={maximised ? 'Restore' : 'Maximise'}
        >
          {maximised ? (
            <svg width="10" height="10" viewBox="0 0 10 10" className="fill-none stroke-current" strokeWidth="1">
              <rect x="2" y="0" width="8" height="8" rx="0.5" />
              <rect x="0" y="2" width="8" height="8" rx="0.5" fill="var(--color-card)" />
              <rect x="0" y="2" width="8" height="8" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" className="fill-none stroke-current" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>
        {/* Close */}
        <button
          onClick={quit}
          className="inline-flex size-10 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" strokeWidth="1.5" />
        </button>
      </div>
    </div>
  )
}
