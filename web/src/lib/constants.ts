export const presetLabelKeys = ['family', 'friend', 'colleague', 'client', 'pet', 'other'] as const

export const labelColors: Record<string, string> = {
  family: 'bg-pink-100 text-pink-800',
  friend: 'bg-green-100 text-green-800',
  colleague: 'bg-blue-100 text-blue-800',
  client: 'bg-purple-100 text-purple-800',
  pet: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-800',
}

export const nodeLabelColors: Record<string, string> = {
  family: '#ec4899',
  friend: '#22c55e',
  colleague: '#3b82f6',
  client: '#a855f7',
  pet: '#f59e0b',
  other: '#6b7280',
}

export const edgeColorPool = ['#6366f1', '#14b8a6', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#ef4444']

export function getNodeLabelColor(label: string): string {
  return nodeLabelColors[label] || edgeColorPool[(label.charCodeAt(0) + (label.length > 1 ? label.charCodeAt(1) : 0)) % edgeColorPool.length]
}
