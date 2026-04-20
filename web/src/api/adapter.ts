import type {
  User, Contact, Tag, Interaction, Reminder,
  ContactRelation, GraphData, AuthResponse, Event, Transaction, TransactionSummary,
  AIProvider, AIConversation, AIMessage, AIProviderPreset
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
  list(params: { page: number; page_size: number; search?: string; tag_ids?: number[] }): Promise<{ items: Contact[]; total: number; page: number; page_size: number }>
  create(data: Partial<Contact>): Promise<Contact>
  getByID(id: number): Promise<Contact>
  update(id: number, data: Partial<Contact>): Promise<Contact>
  delete(id: number): Promise<void>
  getTags(id: number): Promise<Tag[]>
  replaceTags(id: number, tagIDs: number[]): Promise<void>
}

export interface TagAdapter {
  list(): Promise<Tag[]>
  create(data: { name: string; color: string }): Promise<Tag>
  update(id: number, data: { name: string; color: string }): Promise<Tag>
  delete(id: number): Promise<void>
}

export interface InteractionAdapter {
  listByContact(contactID: number, page: number, pageSize: number): Promise<{ items: Interaction[]; total: number }>
  create(contactID: number, data: Partial<Interaction>): Promise<Interaction>
  update(id: number, data: Partial<Interaction>): Promise<Interaction>
  delete(id: number): Promise<void>
}

export interface ReminderAdapter {
  list(status?: string): Promise<Reminder[]>
  create(contactID: number, data: Partial<Reminder>): Promise<Reminder>
  update(id: number, data: Partial<Reminder>): Promise<Reminder>
  delete(id: number): Promise<void>
}

export interface GraphAdapter {
  getGraph(): Promise<GraphData>
  getRelations(contactID: number): Promise<ContactRelation[]>
  createRelation(contactIDA: number, data: { contact_id_b: number; relation_type: string }): Promise<ContactRelation>
  deleteRelation(id: number): Promise<void>
}

export interface ExportAdapter {
  exportJSON(): Promise<string>
  importJSON(data: string): Promise<void>
}

export interface EventAdapter {
  list(params?: { page?: number; page_size?: number; start_after?: string; end_before?: string }): Promise<{ items: Event[]; total: number; page: number; page_size: number }>
  create(data: Partial<Event>): Promise<Event>
  update(id: number, data: Partial<Event>): Promise<Event>
  delete(id: number): Promise<void>
}

export interface TransactionAdapter {
  list(params?: { page?: number; page_size?: number; type?: string }): Promise<{ items: Transaction[]; total: number; page: number; page_size: number }>
  summary(): Promise<TransactionSummary>
  create(data: Partial<Transaction>): Promise<Transaction>
  update(id: number, data: Partial<Transaction>): Promise<Transaction>
  delete(id: number): Promise<void>
}

export interface AIAdapter {
  listPresets(): Promise<AIProviderPreset[]>
  listProviders(): Promise<AIProvider[]>
  saveProvider(data: { provider_type: string; api_key: string; model?: string; base_url?: string }): Promise<AIProvider>
  activateProvider(id: number): Promise<void>
  testConnection(id: number): Promise<{ success: boolean; error?: string }>
  listConversations(params?: { page?: number; page_size?: number }): Promise<{ items: AIConversation[]; total: number; page: number; page_size: number }>
  createConversation(data?: { title?: string }): Promise<AIConversation>
  getMessages(conversationId: number): Promise<AIMessage[]>
  deleteConversation(id: number): Promise<void>
  analyzeRelationship(contactId: number): Promise<{ analysis: string }>
  analyzeEvent(eventId: number): Promise<{ analysis: string }>
  chat(conversationId: number, message: string): Promise<string>
}

export interface DesktopAdapter {
  version(): Promise<string>
  platform(): Promise<string>
  arch(): Promise<string>
  dataDir(): Promise<string>
  databasePath(): Promise<string>
  openDataDir(): Promise<void>
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
  transaction: TransactionAdapter
  ai: AIAdapter
  desktop?: DesktopAdapter
}
