import '@testing-library/jest-dom'

// jsdom lacks ResizeObserver; Base UI overlay positioners (menu/select
// popups) observe their anchors and never open without it.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom lacks matchMedia; Base UI overlay components (menus, selects, dialogs)
// consult it for motion/viewport behavior and crash without it.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
