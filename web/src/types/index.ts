export type RelationshipType = 'family' | 'friend' | 'colleague' | 'client' | 'other'

export type InteractionType = 'meeting' | 'call' | 'message' | 'email' | 'other'

export type ReminderStatus = 'pending' | 'done' | 'snoozed'

export interface User {
  id: number
  username: string
  email: string
  created_at: string
  updated_at: string
}

export interface Contact {
  id: number
  user_id: number
  name: string
  nickname: string
  avatar_url: string
  phone: string
  email: string
  birthday: string | null
  notes: string
  relationship_type: RelationshipType
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  user_id: number
  name: string
  color: string
  created_at: string
}

export interface Interaction {
  id: number
  user_id: number
  contact_id: number
  type: InteractionType
  title: string
  content: string
  occurred_at: string
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: number
  user_id: number
  contact_id: number
  title: string
  description: string
  remind_at: string
  status: ReminderStatus
  created_at: string
  updated_at: string
}

export interface ContactRelation {
  id: number
  user_id: number
  contact_id_a: number
  contact_id_b: number
  relation_type: string
  created_at: string
}

export interface GraphNode {
  id: number
  name: string
  relationship_type: string
  avatar_url: string
}

export interface GraphEdge {
  source: number
  target: number
  relation_type: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AuthResponse {
  user: User
  access_token: string
  refresh_token: string
}

export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
