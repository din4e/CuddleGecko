import type { ReactNode } from 'react'

/**
 * 登录 / 注册页外壳：柔和渐变背景 + 装饰光斑，让版面更「可爱」、不单调。
 */
export function AuthScaffold({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-primary/[0.08] via-background to-secondary/40 dark:from-primary/[0.12] dark:via-background dark:to-secondary/25">
      <div
        className="pointer-events-none absolute -top-20 -left-28 size-72 rounded-full bg-primary/25 blur-3xl dark:bg-primary/20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-24 size-64 rounded-full bg-chart-2/30 blur-3xl dark:bg-chart-3/25"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/3 size-48 rounded-full bg-accent/35 blur-2xl dark:bg-accent/20"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 sm:p-6">{children}</div>
    </div>
  )
}
