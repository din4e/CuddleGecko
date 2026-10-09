import type {
  User, Contact, Tag, Interaction, Reminder,
  ContactRelation, GraphData, AuthResponse, Event, Transaction, TransactionSummary,
  AIProvider, AIConversation, AIMessage, AIProviderPreset, Workspace, Todo
} from '@/types'

export interface AuthAdapter {
  register(username: string, email: string, password: string, captcha?: { captcha_id: string; captcha_answer: string }): Promise<AuthResponse>
  login(username: string, password: string, captcha?: { captcha_id: string; captcha_answer: string }): Promise<AuthResponse>
  refresh(refreshToken: string): Promise<AuthResponse>
  me(): Promise<User>
}

export interface CaptchaAdapter {
  get(): Promise<{ enabled: boolean; captcha_id?: string; captcha_image?: string }>
}

export interface ContactAdapter {
  list(params: { page: number; page_size: number; search?: string; tag_ids?: string[] }): Promise<{ items: Contact[]; total: number; page: number; page_size: number }>
  create(data: Partial<Contact>): Promise<Contact>
  getByID(id: string): Promise<Contact>
  update(id: string, data: Partial<Contact>): Promise<Contact>
  delete(id: string): Promise<void>
  getTags(id: string): Promise<Tag[]>
  replaceTags(id: string, tagIDs: string[]): Promise<void>
}

export interface TagAdapter {
  list(): Promise<Tag[]>
  create(data: { name: string; color: string }): Promise<Tag>
  update(id: string, data: { name: string; color: string }): Promise<Tag>
  delete(id: string): Promise<void>
}

export interface InteractionAdapter {
  listByContact(contactID: number, page: number, pageSize: number): Promise<{ items: Interaction[]; total: number }>
  create(contactID: number, data: Partial<Interaction>): Promise<Interaction>
  update(id: string, data: Partial<Interaction>): Promise<Interaction>
  delete(id: string): Promise<void>
}

export interface ReminderAdapter {
  list(status?: string): Promise<Reminder[]>
  create(contactID: number, data: Partial<Reminder>): Promise<Reminder>
  update(id: string, data: Partial<Reminder>): Promise<Reminder>
  delete(id: string): Promise<void>
}

export interface GraphAdapter {
  getGraph(): Promise<GraphData>
  getRelations(contactID: number): Promise<ContactRelation[]>
  createRelation(contactIDA: number, data: { contact_id_b: number; relation_type: string }): Promise<ContactRelation>
  deleteRelation(id: string): Promise<void>
}

export interface ExportAdapter {
  exportJSON(): Promise<string>
  exportTodosCSV(): Promise<string>
  exportContactsCSV(): Promise<string>
  exportTransactionsCSV(): Promise<string>
  exportEventsCSV(): Promise<string>
  importJSON(data: string): Promise<void>
  importTodosCSV(data: string): Promise<number>
  importContactsCSV(data: string): Promise<number>
  importTransactionsCSV(data: string): Promise<number>
  importTodosFromPlatform(platform: string, data: string): Promise<TodoImportResult>
  exportModule(module: string, format: 'csv' | 'json'): Promise<string>
  importModule(module: string, format: 'csv' | 'json', data: string): Promise<TodoImportResult>
}

export interface TodoImportResult {
  imported: number
  skipped: number
}

export interface EventAdapter {
  list(params?: { page?: number; page_size?: number; start_after?: string; end_before?: string }): Promise<{ items: Event[]; total: number; page: number; page_size: number }>
  create(data: Partial<Event>): Promise<Event>
  update(id: string, data: Partial<Event>): Promise<Event>
  delete(id: string): Promise<void>
}

export interface TransactionAdapter {
  list(params?: { page?: number; page_size?: number; type?: string }): Promise<{ items: Transaction[]; total: number; page: number; page_size: number }>
  summary(): Promise<TransactionSummary>
  create(data: Partial<Transaction>): Promise<Transaction>
  update(id: string, data: Partial<Transaction>): Promise<Transaction>
  delete(id: string): Promise<void>
}

export interface AIAdapter {
  envProviderStatus(): Promise<{ configured: boolean; provider_type: string; model: string; base_url: string }>
  listPresets(): Promise<AIProviderPreset[]>
  listProviders(): Promise<AIProvider[]>
  saveProvider(data: { provider_type: string; api_key: string; model?: string; base_url?: string }): Promise<AIProvider>
  activateProvider(id: string): Promise<void>
  testConnection(id: string): Promise<{ success: boolean; error?: string }>
  listConversations(params?: { page?: number; page_size?: number }): Promise<{ items: AIConversation[]; total: number; page: number; page_size: number }>
  createConversation(data?: { title?: string }): Promise<AIConversation>
  getMessages(conversationId: string): Promise<AIMessage[]>
  deleteConversation(id: string): Promise<void>
  analyzeRelationship(contactId: string): Promise<{ analysis: string }>
  analyzeEvent(eventId: string): Promise<{ analysis: string }>
  analyzeComprehensive(data: {
    type: 'contact' | 'event' | 'financial' | 'comprehensive'
    contact_ids?: string[]
    event_ids?: string[]
    question?: string
  }): Promise<{ analysis: string }>
  chat(conversationId: string, message: string): Promise<string>
}

export interface WorkspaceAdapter {
  list(): Promise<Workspace[]>
  create(data: { name: string; description?: string; icon?: string }): Promise<Workspace>
  update(id: string, data: { name?: string; description?: string; icon?: string }): Promise<Workspace>
  delete(id: string): Promise<void>
  switch(id: string): Promise<Workspace>
  getDefault(): Promise<Workspace>
}

export interface TodoAdapter {
  list(status?: string): Promise<Todo[]>
  create(data: Partial<Todo>): Promise<Todo>
  update(id: string, data: Partial<Todo>): Promise<Todo>
  toggleStatus(id: string): Promise<Todo>
  syncToEvent(id: string): Promise<Event>
  delete(id: string): Promise<void>
}

export interface AppAdapters {
  auth: AuthAdapter
  captcha: CaptchaAdapter
  contact: ContactAdapter
  tag: TagAdapter
  interaction: InteractionAdapter
  reminder: ReminderAdapter
  graph: GraphAdapter
  export: ExportAdapter
  event: EventAdapter
  todo: TodoAdapter
  transaction: TransactionAdapter
  ai: AIAdapter
  workspace: WorkspaceAdapter
}
