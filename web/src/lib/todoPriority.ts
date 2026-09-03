/** Shared visual language for todo priority chips (cards + tree rows). */
export const priorityConfig: Record<string, { color: string; bg: string }> = {
  high: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  normal: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  low: { color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
  none: { color: 'text-muted-foreground', bg: 'bg-muted/60' },
}
