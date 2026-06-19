export function isWailsRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __WAILS__?: boolean }).__WAILS__
}
