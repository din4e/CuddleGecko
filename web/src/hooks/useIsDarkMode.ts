import { useSyncExternalStore } from 'react'

/**
 * Reactive dark-mode flag backed by the `dark` class on <html>.
 *
 * Uses useSyncExternalStore (the React-blessed way to read external mutable
 * state) with a MutationObserver on the <html> class attribute. Theme toggles
 * (AppLayout.toggleTheme flips that class) re-render consumers, and canvas
 * paint callbacks (force-graph's nodeCanvasObject / linkColor, invoked every
 * animation frame) read a cached boolean instead of touching the DOM each frame.
 */
function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function useIsDarkMode(): boolean {
  // getServerSnapshot defaults to light; this is a client-only SPA so the real
  // value is read on hydration.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
