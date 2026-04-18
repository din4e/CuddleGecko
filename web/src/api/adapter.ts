import type {
  User, Contact, Tag, Interaction, Reminder,
  ContactRelation, GraphData, AuthResponse
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

export interface AppAdapters {
  auth: AuthAdapter
  captcha: CaptchaAdapter
  contact: ContactAdapter
  tag: TagAdapter
  interaction: InteractionAdapter
  reminder: ReminderAdapter
  graph: GraphAdapter
  export: ExportAdapter
}
