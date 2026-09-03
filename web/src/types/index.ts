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
  /** 'solar' (default) | 'lunar' — when lunar, birthday Y/M/D are a lunar date. */
  birthday_calendar: 'solar' | 'lunar' | null
  notes: string
  relationship_labels: string[]
  tags: Tag[]
  created_at: string
  updated_at: string
}

/** Buddy birthday with the next occurrence resolved to a Gregorian date. */
export interface UpcomingBirthday {
  contact: Contact
  next_birthday: string
  days_until: number
  calendar: 'solar' | 'lunar'
  is_today: boolean
  age_turning: number
  lunar_text?: string
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
  last_interaction_at?: string
}

export interface GraphEdge {
  source: number
  target: number
  relation_type: string
  created_at?: string
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

export interface TransactionMonthly {
  month: string // "YYYY-MM"
  income: number
  expense: number
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

export type TodoStatus = 'pending' | 'done' | 'abandoned'
export type TodoPriority = 'none' | 'low' | 'normal' | 'high'
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
  /** Pending todos whose start_time is still in the future. */
  deferred?: boolean
  /** completed_at at or after this time (done-today / done-this-week lists). */
  done_after?: string
  /** Single tag id, or several for an any-of (OR) filter. */
  tag_id?: number | number[]
  sort?: TodoSort
  order?: 'asc' | 'desc'
  parent_id?: number | null
  /** Only top-level todos (parent_id IS NULL) — lazy tree roots. */
  roots_only?: boolean
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

export interface Habit {
  id: number
  user_id: number
  workspace_id: number
  name: string
  color: string
  emoji: string
  frequency: string
  archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // virtual (service-enriched)
  today_done: boolean
  streak: number
  best: number
  rate_30: number
  recent: string[] // checked-in dates YYYY-MM-DD within the heatmap window
}

export type PomodoroKind = 'focus' | 'break'

export interface PomodoroSession {
  id: number
  user_id: number
  workspace_id: number
  todo_id: number | null
  duration_seconds: number
  kind: PomodoroKind
  completed: boolean
  started_at: string
  ended_at: string
  created_at: string
}

export interface PomodoroSummary {
  today_count: number
  today_seconds: number
  total_count: number
  total_seconds: number
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
  // Server-computed count of live direct children — drives the lazy tree's
  // expand caret before the children have been fetched.
  child_count?: number
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

/** One audit-log line: which user changed what on a todo, when. */
export interface TodoActivity {
  id: number
  todo_id: number
  user_id: number
  username: string
  /** created / updated / completed / reopened / pinned / unpinned / moved / deleted / restored */
  action: string
  /** Changed field when action === 'updated' (title / description / priority / …). */
  field: string
  old_value: string
  new_value: string
  created_at: string
}

export interface TodoStats {
  total: number
  pending: number
  overdue: number
  deferred: number
  done_today: number
  done_this_week: number
}

// --- Fitness module (workouts + body metrics) ---

export type WorkoutType = 'strength' | 'cardio' | 'flexibility' | 'balance' | 'sport' | 'other'
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'
export type WorkoutIntensity = '' | 'low' | 'medium' | 'high'
export type WorkoutSort = 'scheduled' | 'created' | 'manual'

export interface Workout {
  id: number
  user_id: number
  workspace_id: number
  name: string
  type: WorkoutType
  status: WorkoutStatus
  intensity: WorkoutIntensity
  scheduled_at: string | null
  duration_min: number | null
  calories: number | null
  color: string
  location: string
  notes: string
  sort_order: number
  completed_at: string | null
  /** Denormalized exercise progress (optional on the client for resilience). */
  item_total?: number
  item_done?: number
  created_at: string
  updated_at: string
}

export interface WorkoutExercise {
  id: number
  workout_id: number
  name: string
  category: string
  sets: number | null
  reps: number | null
  weight: number | null
  distance: number | null
  duration_sec: number | null
  rest_sec: number | null
  done: boolean
  sort_order: number
  notes: string
  created_at: string
  updated_at: string
}

export interface BodyMetric {
  id: number
  user_id: number
  workspace_id: number
  recorded_at: string
  weight: number | null
  height: number | null
  body_fat: number | null
  muscle_mass: number | null
  resting_hr: number | null
  systolic: number | null
  diastolic: number | null
  sleep_hours: number | null
  steps: number | null
  energy: number | null
  mood: number | null
  notes: string
  created_at: string
  updated_at: string
}

export interface WorkoutStats {
  total: number
  planned: number
  in_progress: number
  completed: number
  skipped: number
  this_week: number
  total_minutes: number
  total_calories: number
  /** Consecutive weeks with at least one completed workout. */
  streak_weeks?: number
}

export interface BodyMetricSummary {
  latest: BodyMetric | null
  latest_weight: number | null
  prev_weight: number | null
  weight_trend: 'up' | 'down' | 'flat' | 'none'
  count: number
  first_at: string | null
  last_at: string | null
  /** Per-metric latest/prev/trend for keys like body_fat, muscle_mass, … */
  metrics?: Partial<Record<'body_fat' | 'muscle_mass' | 'resting_hr' | 'systolic' | 'diastolic' | 'sleep_hours' | 'steps' | 'energy' | 'mood', BodyMetricStat>>
}

/** Query parameters for listing workouts. */
export interface WorkoutListParams {
  status?: WorkoutStatus
  type?: WorkoutType
  q?: string
  date_after?: string
  date_before?: string
  sort?: WorkoutSort
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

/** Update payload with explicit clear flags for nullable fields. */
export interface WorkoutUpdateInput extends Partial<Omit<Workout, 'scheduled_at' | 'duration_min' | 'calories'>> {
  scheduled_at?: string | null
  duration_min?: number | null
  calories?: number | null
  clear_scheduled_at?: boolean
  clear_duration_min?: boolean
  clear_calories?: boolean
}

export interface WorkoutExerciseInput {
  name: string
  category?: string
  sets?: number | null
  reps?: number | null
  weight?: number | null
  distance?: number | null
  duration_sec?: number | null
  rest_sec?: number | null
  notes?: string
}

export interface BodyMetricInput {
  recorded_at?: string
  weight?: number | null
  height?: number | null
  body_fat?: number | null
  muscle_mass?: number | null
  resting_hr?: number | null
  systolic?: number | null
  diastolic?: number | null
  sleep_hours?: number | null
  steps?: number | null
  energy?: number | null
  mood?: number | null
  notes?: string
}

/** BMI from weight (kg) + height (cm); 0 when inputs are missing/non-positive. */
export function bmi(weightKg?: number | null, heightCm?: number | null): number {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return 0
  const m = heightCm / 100
  return weightKg / (m * m)
}

// --- Fitness enhancements (history / PRs / library / templates / set logs / goals) ---

export type WorkoutHistoryBucket = {
  bucket: string
  count: number
  minutes: number
  calories: number
}

export type WorkoutPR = {
  exercise: string
  best_weight: number
  best_e1rm: number
  best_set_at: string
}

export interface ExerciseLibraryItem {
  id: number
  name: string
  category: string
  muscle_groups: string[]
  equipment: string
  notes: string
  created_at: string
  updated_at: string
}

export type ExerciseLibraryInput = Partial<Omit<ExerciseLibraryItem, 'id' | 'created_at' | 'updated_at'>>

export interface WorkoutTemplateItem {
  id: number
  name: string
  category: string
  sets: number | null
  reps: number | null
  weight: number | null
  distance: number | null
  duration_sec: number | null
  rest_sec: number | null
  sort_order: number
}

export interface WorkoutTemplate {
  id: number
  name: string
  type: WorkoutType
  notes: string
  items: WorkoutTemplateItem[]
  created_at: string
  updated_at: string
}

export interface WorkoutTemplateInput {
  name?: string
  type?: WorkoutType
  notes?: string
  items?: Array<Omit<WorkoutTemplateItem, 'id'>>
}

export interface SetLog {
  id: number
  set_index: number
  reps: number | null
  weight: number | null
  distance: number | null
  duration_sec: number | null
  done: boolean
  notes: string
}

export interface SetLogInput {
  reps?: number | null
  weight?: number | null
  distance?: number | null
  duration_sec?: number | null
  done?: boolean
  notes?: string
}

export type FitnessGoalType = 'weekly_workouts' | 'weight_target'
export type FitnessGoalStatus = 'active' | 'done'

export interface FitnessGoal {
  id: number
  type: FitnessGoalType
  target_value: number
  deadline: string | null
  status: FitnessGoalStatus
  current_value: number
  created_at: string
  updated_at: string
}

export interface FitnessGoalInput {
  type?: FitnessGoalType
  target_value?: number
  deadline?: string | null
  status?: FitnessGoalStatus
}

export type BodyMetricTrend = 'up' | 'down' | 'flat' | 'none'

export interface BodyMetricStat {
  latest: number | null
  prev: number | null
  trend: BodyMetricTrend
}
