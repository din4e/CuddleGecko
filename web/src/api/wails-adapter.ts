import type { AppAdapters } from './adapter'
import type {
  Contact, Interaction, Reminder, ContactRelation,
  GraphData, AuthResponse, User, Tag,
} from '@/types'

// Wails bindings are generated at build time by `wails dev` or `wails build`.
// Imports reference the generated wailsjs directory which may not exist in web-only builds.
// Using dynamic imports to avoid bundling issues when running in pure web mode.
//
// The generated Wails model types use `string` for enum fields and `any` for time fields,
// while our frontend types use union types (InteractionType, ReminderStatus) and `string`.
// We bridge this with `as any` casts — the runtime serialization is identical.

async function createWailsAdapters(): Promise<AppAdapters> {
  const [
    { Register, Login, Refresh, Me },
    { Get: GetCaptcha },
    { List: ListContacts, Create: CreateContact, GetByID, Update: UpdateContact, Delete: DeleteContact, GetTags, ReplaceTags },
    { List: ListTags, Create: CreateTag, Update: UpdateTag, Delete: DeleteTag },
    { ListByContact, Create: CreateInteraction, Update: UpdateInteraction, Delete: DeleteInteraction },
    { List: ListReminders, Create: CreateReminder, Update: UpdateReminder, Delete: DeleteReminder },
    { GetGraph, GetRelations, CreateRelation, DeleteRelation },
    { ExportJSON, ImportJSON },
  ] = await Promise.all([
    import('@/wailsjs/go/bindings/AuthBinding'),
    import('@/wailsjs/go/bindings/CaptchaBinding'),
    import('@/wailsjs/go/bindings/ContactBinding'),
    import('@/wailsjs/go/bindings/TagBinding'),
    import('@/wailsjs/go/bindings/InteractionBinding'),
    import('@/wailsjs/go/bindings/ReminderBinding'),
    import('@/wailsjs/go/bindings/GraphBinding'),
    import('@/wailsjs/go/bindings/ExportBinding'),
  ])

  return {
    auth: {
      register: async (username, email, password, captcha) => {
        const r = await Register(username, email, password, captcha?.captcha_id || '', captcha?.captcha_answer || '')
        return r as any as AuthResponse
      },
      login: async (username, password, captcha) => {
        const r = await Login(username, password, captcha?.captcha_id || '', captcha?.captcha_answer || '')
        return r as any as AuthResponse
      },
      refresh: async (token) => {
        const r = await Refresh(token)
        return r as any as AuthResponse
      },
      me: async () => {
        const u = await Me()
        return u as any as User
      },
    },

    captcha: {
      get: () => GetCaptcha(),
    },

    contact: {
      list: async (params) => {
        const r = await ListContacts({
          page: params.page,
          page_size: params.page_size,
          search: params.search || '',
          tag_ids: params.tag_ids || [],
        } as any)
        return r as any
      },
      create: async (data) => {
        const r = await CreateContact({
          name: data.name || '',
          nickname: data.nickname || '',
          avatar_url: data.avatar_url || '',
          phone: data.phone || '',
          email: data.email || '',
          birthday: data.birthday || null,
          notes: data.notes || '',
          relationship_labels: data.relationship_labels || [],
        } as any)
        return r as any as Contact
      },
      getByID: async (id) => {
        const r = await GetByID(id)
        return r as any as Contact
      },
      update: async (id, data) => {
        const r = await UpdateContact(id, {
          name: data.name || '',
          nickname: data.nickname || '',
          avatar_url: data.avatar_url || '',
          phone: data.phone || '',
          email: data.email || '',
          birthday: data.birthday || null,
          notes: data.notes || '',
          relationship_labels: data.relationship_labels || [],
        } as any)
        return r as any as Contact
      },
      delete: (id) => DeleteContact(id).then(() => {}),
      getTags: async (id) => {
        const r = await GetTags(id)
        return r as any as Tag[]
      },
      replaceTags: (id, tagIDs) => ReplaceTags(id, tagIDs as any).then(() => {}),
    },

    tag: {
      list: async () => {
        const r = await ListTags()
        return r as any as Tag[]
      },
      create: async (data) => {
        const r = await CreateTag(data as any)
        return r as any as Tag
      },
      update: async (id, data) => {
        const r = await UpdateTag(id, data as any)
        return r as any as Tag
      },
      delete: (id) => DeleteTag(id).then(() => {}),
    },

    interaction: {
      listByContact: async (contactID, page, pageSize) => {
        const r = await ListByContact(contactID, page, pageSize)
        return r as any as { items: Interaction[]; total: number }
      },
      create: async (contactID, data) => {
        const r = await CreateInteraction(contactID, {
          type: data.type || '',
          title: data.title || '',
          content: data.content || '',
          occurred_at: data.occurred_at || '',
        } as any)
        return r as any as Interaction
      },
      update: async (id, data) => {
        const r = await UpdateInteraction(id, {
          type: data.type || '',
          title: data.title || '',
          content: data.content || '',
          occurred_at: data.occurred_at || '',
        } as any)
        return r as any as Interaction
      },
      delete: (id) => DeleteInteraction(id).then(() => {}),
    },

    reminder: {
      list: async (status) => {
        const r = await ListReminders(status || '')
        return r as any as Reminder[]
      },
      create: async (contactID, data) => {
        const r = await CreateReminder(contactID, {
          title: data.title || '',
          description: data.description || '',
          remind_at: data.remind_at || '',
        } as any)
        return r as any as Reminder
      },
      update: async (id, data) => {
        const r = await UpdateReminder(id, {
          title: data.title || '',
          description: data.description || '',
          remind_at: data.remind_at || '',
          status: data.status || '',
        } as any)
        return r as any as Reminder
      },
      delete: (id) => DeleteReminder(id).then(() => {}),
    },

    graph: {
      getGraph: async () => {
        const r = await GetGraph()
        return r as any as GraphData
      },
      getRelations: async (contactID) => {
        const r = await GetRelations(contactID)
        return r as any as ContactRelation[]
      },
      createRelation: async (contactIDA, data) => {
        const r = await CreateRelation(contactIDA, data as any)
        return r as any as ContactRelation
      },
      deleteRelation: (id) => DeleteRelation(id).then(() => {}),
    },

    export: {
      exportJSON: () => ExportJSON(),
      importJSON: (data) => ImportJSON(data).then(() => {}),
    },
  }
}

export { createWailsAdapters }
