import type { ReactNode } from 'react'

interface ListPageHeaderProps {
  title: string
  actions?: ReactNode
}

export default function ListPageHeader({ title, actions }: ListPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
