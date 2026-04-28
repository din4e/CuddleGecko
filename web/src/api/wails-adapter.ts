import type { AppAdapters } from './adapter'
import type {
  Contact, Interaction, Reminder, ContactRelation,
  GraphData, AuthResponse, User, Tag, Event, Transaction, TransactionSummary,
  AIProvider, AIConversation, AIMessage, AIProviderPreset, Workspace,
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
    { List: ListEvents, Create: CreateEvent, Update: UpdateEvent, Delete: DeleteEvent },
    { List: ListTransactions, Summary: TransactionSummary, Create: CreateTransaction, Update: UpdateTransaction, Delete: DeleteTransaction },
    { ListProviders: AIListProviders, SaveProvider: AISaveProvider, ActivateProvider: AIActivateProvider, TestConnection: AITestConnection, ListConversations: AIListConversations, CreateConversation: AICreateConversation, GetMessages: AIGetMessages, DeleteConversation: AIDeleteConversation, Chat: AIChatFn, AnalyzeRelationship: AIAnalyzeRelationship, AnalyzeEvent: AIAnalyzeEvent, ListPresets: AIListPresets },
    { Version: DesktopVersion, Platform: DesktopPlatform, Arch: DesktopArch, DataDir: DesktopDataDir, DatabasePath: DesktopDatabasePath, OpenDataDir: DesktopOpenDataDir },
  ] = await Promise.all([
    import('@/wailsjs/go/bindings/AuthBinding'),
    import('@/wailsjs/go/bindings/CaptchaBinding'),
    import('@/wailsjs/go/bindings/ContactBinding'),
    import('@/wailsjs/go/bindings/TagBinding'),
    import('@/wailsjs/go/bindings/InteractionBinding'),
    import('@/wailsjs/go/bindings/ReminderBinding'),
    import('@/wailsjs/go/bindings/GraphBinding'),
    import('@/wailsjs/go/bindings/ExportBinding'),
    import('@/wailsjs/go/bindings/EventBinding'),
    import('@/wailsjs/go/bindings/TransactionBinding'),
    import('@/wailsjs/go/bindings/AIBinding'),
    import('@/wailsjs/go/bindings/DesktopBinding'),
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
          phones: data.phones || [],
          emails: data.emails || [],
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
          phones: data.phones || [],
          emails: data.emails || [],
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

    event: {
      list: async (params) => {
        const r = await ListEvents({
          page: params?.page || 1,
          page_size: params?.page_size || 50,
          start_after: params?.start_after || '',
          end_before: params?.end_before || '',
        } as any)
        return r as any
      },
      create: async (data) => {
        const r = await CreateEvent({
          title: data.title || '',
          description: data.description || '',
          start_time: data.start_time || '',
          end_time: data.end_time || '',
          location: data.location || '',
          contact_ids: data.contact_ids || [],
          color: data.color || '',
        } as any)
        return r as any as Event
      },
      update: async (id, data) => {
        const r = await UpdateEvent(id, {
          title: data.title || '',
          description: data.description || '',
          start_time: data.start_time || '',
          end_time: data.end_time || '',
          location: data.location || '',
          contact_ids: data.contact_ids || [],
          color: data.color || '',
        } as any)
        return r as any as Event
      },
      delete: (id) => DeleteEvent(id).then(() => {}),
    },

    transaction: {
      list: async (params) => {
        const r = await ListTransactions({
          page: params?.page || 1,
          page_size: params?.page_size || 50,
          type: params?.type || '',
        } as any)
        return r as any
      },
      summary: async () => {
        const r = await TransactionSummary()
        return r as any as TransactionSummary
      },
      create: async (data) => {
        const r = await CreateTransaction({
          title: data.title || '',
          amount: data.amount || 0,
          type: data.type || '',
          category: data.category || '',
          contact_ids: data.contact_ids || [],
          date: data.date || '',
          notes: data.notes || '',
        } as any)
        return r as any as Transaction
      },
      update: async (id, data) => {
        const r = await UpdateTransaction(id, {
          title: data.title || '',
          amount: data.amount || 0,
          type: data.type || '',
          category: data.category || '',
          contact_ids: data.contact_ids || [],
          date: data.date || '',
          notes: data.notes || '',
        } as any)
        return r as any as Transaction
      },
      delete: (id) => DeleteTransaction(id).then(() => {}),
    },

    ai: {
      listPresets: async () => {
        const r = await AIListPresets()
        return r as any as AIProviderPreset[]
      },
      listProviders: async () => {
        const r = await AIListProviders()
        return r as any as AIProvider[]
      },
      saveProvider: async (data) => {
        const r = await AISaveProvider({
          provider_type: data.provider_type,
          api_key: data.api_key,
          model: data.model || '',
          base_url: data.base_url || '',
        } as any)
        return r as any as AIProvider
      },
      activateProvider: (id) => AIActivateProvider(id).then(() => {}),
      testConnection: async (id) => {
        try {
          await AITestConnection(id)
          return { success: true }
        } catch (e: any) {
          return { success: false, error: e?.message || String(e) }
        }
      },
      listConversations: async (params) => {
        const r = await AIListConversations(params?.page || 1, params?.page_size || 20)
        return r as any
      },
      createConversation: async (data) => {
        const r = await AICreateConversation(data?.title || '')
        return r as any as AIConversation
      },
      getMessages: async (conversationId) => {
        const r = await AIGetMessages(conversationId)
        return r as any as AIMessage[]
      },
      deleteConversation: (id) => AIDeleteConversation(id).then(() => {}),
      analyzeRelationship: async (contactId) => {
        const r = await AIAnalyzeRelationship(contactId)
        return r as any as { analysis: string }
      },
      analyzeEvent: async (eventId) => {
        const r = await AIAnalyzeEvent(eventId)
        return r as any as { analysis: string }
      },
      analyzeComprehensive: async (data) => {
        // Fallback to HTTP API until Wails bindings are regenerated
        const resp = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('access_token')}` },
          body: JSON.stringify(data),
        })
        return resp.json().then((r: { data: { analysis: string } }) => r.data)
      },
      chat: async (conversationId, message) => {
        const r = await AIChatFn(conversationId, message)
        return r as any as string
      },
    },

    desktop: {
      version: () => DesktopVersion(),
      platform: () => DesktopPlatform(),
      arch: () => DesktopArch(),
      dataDir: () => DesktopDataDir(),
      databasePath: () => DesktopDatabasePath(),
      openDataDir: () => DesktopOpenDataDir().then(() => {}),
    },

    workspace: {
      list: async () => {
        const { List: WSList } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSList()
        return r as any as Workspace[]
      },
      create: async (data) => {
        const { Create: WSCreate } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSCreate(data.name, data.description || '', data.icon || '')
        return r as any as Workspace
      },
      update: async (id, data) => {
        const { Update: WSUpdate } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSUpdate(id, data.name || '', data.description || '', data.icon || '')
        return r as any as Workspace
      },
      delete: async (id) => {
        const { Delete: WSDelete } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        await WSDelete(id)
      },
      switch: async (id) => {
        const { Switch: WSSwitch } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSSwitch(id)
        return r as any as Workspace
      },
      getDefault: async () => {
        const { GetDefault: WSGetDefault } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSGetDefault()
        return r as any as Workspace
      },
    },
  }
}

export { createWailsAdapters }
