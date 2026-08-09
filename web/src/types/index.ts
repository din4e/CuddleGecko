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

export type TodoStatus = 'pending' | 'done'
export type TodoPriority = 'low' | 'normal' | 'high'
export type AmountType = '' | 'income' | 'expense'
export type TodoSort = 'due_date' | 'priority' | 'title' | 'created' | 'manual'

/** Query parameters for listing todos (TickTick-style filter/sort/smart-list). */
export interface TodoListParams {
  status?: TodoStatus
  priority?: TodoPriority
  q?: string
  due_before?: string
  due_after?: string
  overdue?: boolean
  started?: boolean
  tag_id?: number
  sort?: TodoSort
  order?: 'asc' | 'desc'
  parent_id?: number | null
  page?: number
  page_size?: number
}

/** Update payload with explicit clear flags for nullable fields. */
export interface TodoUpdateInput extends Partial<Omit<Todo, 'due_time' | 'amount'>> {
  due_time?: string | null
  amount?: number | null
  clear_due_time?: boolean
  clear_start_time?: boolean
  clear_amount?: boolean
}

export interface Todo {
  id: number
  user_id: number
  workspace_id: number
  title: string
  description: string
  status: TodoStatus
  priority: TodoPriority
  due_time: string | null
  start_time?: string | null
  amount: number | null
  amount_type: AmountType
  contact_ids: number[]
  tags?: Tag[]
  color: string
  pinned?: boolean
  repeat?: string
  repeat_interval?: number
  parent_id?: number | null
  sort_order?: number
  completed_at: string | null
  // Denormalized checklist progress (optional on the client for resilience).
  item_total?: number
  item_done?: number
  pomodoro_count?: number
  created_at: string
  updated_at: string
}

export interface TodoItem {
  id: number
  todo_id: number
  content: string
  done: boolean
  due_time?: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TodoStats {
  total: number
  pending: number
  overdue: number
  deferred: number
  done_today: number
  done_this_week: number
}
