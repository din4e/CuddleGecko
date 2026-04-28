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
  avatar_emoji: string
  avatar_url: string
  phones: string[]
  emails: string[]
  birthday: string | null
  notes: string
  relationship_labels: string[]
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
  relationship_labels: string[]
  avatar_emoji: string
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

export interface Event {
  id: number
  user_id: number
  title: string
  description: string
  start_time: string
  end_time: string | null
  location: string
  contact_ids: number[]
  color: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  user_id: number
  title: string
  amount: number
  type: 'income' | 'expense'
  category: string
  contact_ids: number[]
  date: string
  notes: string
  created_at: string
  updated_at: string
}

export interface TransactionSummary {
  income: number
  expense: number
  balance: number
}

export interface AIProvider {
  id: number
  user_id: number
  provider_type: string
  name: string
  base_url: string
  model: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AIConversation {
  id: number
  user_id: number
  title: string
  created_at: string
  updated_at: string
}

export interface AIMessage {
  id: number
  conversation_id: number
  role: 'system' | 'user' | 'assistant'
  content: string
  created_at: string
}

export interface AIProviderPreset {
  Type: string
  Name: string
  BaseURL: string
  DefaultModel: string
}

export interface Workspace {
  id: number
  name: string
  description: string
  icon: string
  owner_id: number
  created_at: string
  updated_at: string
}
