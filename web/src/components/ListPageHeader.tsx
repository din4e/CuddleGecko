import type { ReactNode } from 'react'

interface ListPageHeaderProps {
  title: string
  actions?: ReactNode
}

export default function ListPageHeader({ title, actions }: ListPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
