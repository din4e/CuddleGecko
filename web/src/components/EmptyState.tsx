import { cn } from '../lib/utils'

interface EmptyStateProps {
  message: string
  className?: string
}

export default function EmptyState({ message, className }: EmptyStateProps) {
  return <p className={cn('text-center text-muted-foreground py-12', className)}>{message}</p>
}
