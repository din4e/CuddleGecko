const ICON_LIGHT = '/icon.png?v=4'
const ICON_DARK = '/icon_dark.png?v=4'

const ICON_LINKS = 'link[rel="icon"], link[rel="apple-touch-icon"]'

function applyIcon(dark: boolean) {
  const href = dark ? ICON_DARK : ICON_LIGHT
  document.querySelectorAll<HTMLLinkElement>(ICON_LINKS).forEach((el) => {
    if (el.getAttribute('href') !== href) el.setAttribute('href', href)
  })
}

/**
 * 让浏览器标签 favicon / apple-touch-icon 跟随 <html>.dark 切换（而非仅跟随系统偏好）。
 * 在应用入口调用一次；用 MutationObserver 监听 class 变化，随主题切换即时更新。
 */
export function setupBrandFaviconSync(): void {
  const root = document.documentElement
  applyIcon(root.classList.contains('dark'))
  new MutationObserver(() => applyIcon(root.classList.contains('dark'))).observe(root, {
    attributes: true,
    attributeFilter: ['class'],
  })
}
