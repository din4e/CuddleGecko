import type { AppAdapters } from './adapter'
import type {
  Contact, Interaction, Reminder, ContactRelation,
  GraphData, AuthResponse, User, Tag, Event, Transaction, TransactionSummary,
  AIProvider, AIConversation, AIMessage, AIProviderPreset, Workspace, Todo,
} from '@/types'
import { bindings } from '@/wailsjs/go/models'

// Wails bindings are generated at build time by `wails dev` or `wails build`.
// Imports reference the generated wailsjs directory which may not exist in web-only builds.
// Using dynamic imports to avoid bundling issues when running in pure web mode.
//
// The generated Wails model types use `string` for enum fields and `any` for time fields,
// while our frontend types use union types (InteractionType, ReminderStatus) and `string`.
// We bridge the generated types with a single typed helper so runtime serialization stays
// identical while avoiding `as any as T` casts in this file.

function bridge<T>(value: unknown): T {
  return value as T
}

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
    {
      ListProviders: AIListProviders, SaveProvider: AISaveProvider, ActivateProvider: AIActivateProvider,
      TestConnection: AITestConnection, ListConversations: AIListConversations, CreateConversation: AICreateConversation,
      GetMessages: AIGetMessages, DeleteConversation: AIDeleteConversation, Chat: AIChatFn,
      AnalyzeRelationship: AIAnalyzeRelationship, AnalyzeEvent: AIAnalyzeEvent, AnalyzeComprehensive: AIAnalyzeComprehensive,
      ListPresets: AIListPresets,
    },
    { Version: DesktopVersion, Platform: DesktopPlatform, Arch: DesktopArch, DataDir: DesktopDataDir, DatabasePath: DesktopDatabasePath, OpenDataDir: DesktopOpenDataDir },
    { List: TodoList, Create: TodoCreate, Update: TodoUpdate, ToggleStatus: TodoToggleStatus, SyncToEvent: TodoSyncToEvent, Delete: TodoDelete },
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
    import('@/wailsjs/go/bindings/TodoBinding'),
  ])

  return {
    auth: {
      register: async (username, email, password, captcha) => {
        const r = await Register(username, email, password, captcha?.captcha_id || '', captcha?.captcha_answer || '')
        return bridge<AuthResponse>(r)
      },
      login: async (username, password, captcha) => {
        const r = await Login(username, password, captcha?.captcha_id || '', captcha?.captcha_answer || '')
        return bridge<AuthResponse>(r)
      },
      refresh: async (token) => {
        const r = await Refresh(token)
        return bridge<AuthResponse>(r)
      },
      me: async () => {
        const u = await Me()
        return bridge<User>(u)
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
        } as unknown as bindings.ListContactsInput)
        return bridge<{ items: Contact[]; total: number; page: number; page_size: number }>(r)
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
        } as unknown as bindings.CreateContactInput)
        return bridge<Contact>(r)
      },
      getByID: async (id) => {
        const r = await GetByID(id)
        return bridge<Contact>(r)
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
        } as unknown as bindings.CreateContactInput)
        return bridge<Contact>(r)
      },
      delete: (id) => DeleteContact(id).then(() => {}),
      getTags: async (id) => {
        const r = await GetTags(id)
        return bridge<Tag[]>(r)
      },
      replaceTags: (id, tagIDs) => ReplaceTags(id, tagIDs as unknown as number[]).then(() => {}),
    },

    tag: {
      list: async () => {
        const r = await ListTags()
        return bridge<Tag[]>(r)
      },
      create: async (data) => {
        const r = await CreateTag(data as unknown as bindings.CreateTagInput)
        return bridge<Tag>(r)
      },
      update: async (id, data) => {
        const r = await UpdateTag(id, data as unknown as bindings.UpdateTagInput)
        return bridge<Tag>(r)
      },
      delete: (id) => DeleteTag(id).then(() => {}),
    },

    interaction: {
      listByContact: async (contactID, page, pageSize) => {
        const r = await ListByContact(contactID, page, pageSize)
        return bridge<{ items: Interaction[]; total: number }>(r)
      },
      create: async (contactID, data) => {
        const r = await CreateInteraction(contactID, {
          type: data.type || '',
          title: data.title || '',
          content: data.content || '',
          occurred_at: data.occurred_at || '',
        } as unknown as bindings.CreateInteractionInput)
        return bridge<Interaction>(r)
      },
      update: async (id, data) => {
        const r = await UpdateInteraction(id, {
          type: data.type || '',
          title: data.title || '',
          content: data.content || '',
          occurred_at: data.occurred_at || '',
        } as unknown as bindings.CreateInteractionInput)
        return bridge<Interaction>(r)
      },
      delete: (id) => DeleteInteraction(id).then(() => {}),
    },

    reminder: {
      list: async (status) => {
        const r = await ListReminders(status || '')
        return bridge<Reminder[]>(r)
      },
      create: async (contactID, data) => {
        const r = await CreateReminder(contactID, {
          title: data.title || '',
          description: data.description || '',
          remind_at: data.remind_at || '',
        } as unknown as bindings.CreateReminderInput)
        return bridge<Reminder>(r)
      },
      update: async (id, data) => {
        const r = await UpdateReminder(id, {
          title: data.title || '',
          description: data.description || '',
          remind_at: data.remind_at || '',
          status: data.status || '',
        } as unknown as bindings.UpdateReminderInput)
        return bridge<Reminder>(r)
      },
      delete: (id) => DeleteReminder(id).then(() => {}),
    },

    graph: {
      getGraph: async () => {
        const r = await GetGraph()
        return bridge<GraphData>(r)
      },
      getRelations: async (contactID) => {
        const r = await GetRelations(contactID)
        return bridge<ContactRelation[]>(r)
      },
      createRelation: async (contactIDA, data) => {
        const r = await CreateRelation(contactIDA, data as unknown as bindings.CreateRelationInput)
        return bridge<ContactRelation>(r)
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
        } as unknown as bindings.ListEventsInput)
        return bridge<{ items: Event[]; total: number; page: number; page_size: number }>(r)
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
        } as unknown as bindings.CreateEventInput)
        return bridge<Event>(r)
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
        } as unknown as bindings.CreateEventInput)
        return bridge<Event>(r)
      },
      delete: (id) => DeleteEvent(id).then(() => {}),
    },

    todo: {
      list: async (status) => {
        const r = await TodoList(status || '')
        return bridge<Todo[]>(r)
      },
      create: async (data) => {
        const r = await TodoCreate({
          title: data.title || '',
          description: data.description || '',
          status: data.status || '',
          priority: data.priority || '',
          due_time: data.due_time || '',
          amount: data.amount ?? undefined,
          amount_type: data.amount_type || '',
          contact_ids: data.contact_ids || [],
          color: data.color || '',
        } as unknown as bindings.CreateTodoInput)
        return bridge<Todo>(r)
      },
      update: async (id, data) => {
        const r = await TodoUpdate(id, {
          title: data.title || '',
          description: data.description || '',
          status: data.status || '',
          priority: data.priority || '',
          due_time: data.due_time || '',
          amount: data.amount ?? undefined,
          amount_type: data.amount_type || '',
          contact_ids: data.contact_ids || [],
          color: data.color || '',
        } as unknown as bindings.CreateTodoInput)
        return bridge<Todo>(r)
      },
      toggleStatus: (id) => TodoToggleStatus(id).then(r => bridge<Todo>(r)),
      syncToEvent: (id) => TodoSyncToEvent(id).then(r => bridge<Event>(r)),
      delete: (id) => TodoDelete(id).then(() => {}),
    },

    transaction: {
      list: async (params) => {
        const r = await ListTransactions({
          page: params?.page || 1,
          page_size: params?.page_size || 50,
          type: params?.type || '',
        } as unknown as bindings.ListTransactionsInput)
        return bridge<{ items: Transaction[]; total: number; page: number; page_size: number }>(r)
      },
      summary: async () => {
        const r = await TransactionSummary()
        return bridge<TransactionSummary>(r)
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
        } as unknown as bindings.CreateTransactionInput)
        return bridge<Transaction>(r)
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
        } as unknown as bindings.CreateTransactionInput)
        return bridge<Transaction>(r)
      },
      delete: (id) => DeleteTransaction(id).then(() => {}),
    },

    ai: {
      envProviderStatus: async () => {
        return { configured: false, provider_type: '', model: '', base_url: '' }
      },
      listPresets: async () => {
        const r = await AIListPresets()
        return bridge<AIProviderPreset[]>(r)
      },
      listProviders: async () => {
        const r = await AIListProviders()
        return bridge<AIProvider[]>(r)
      },
      saveProvider: async (data) => {
        const r = await AISaveProvider({
          provider_type: data.provider_type,
          api_key: data.api_key,
          model: data.model || '',
          base_url: data.base_url || '',
        } as unknown as bindings.SaveProviderInput)
        return bridge<AIProvider>(r)
      },
      activateProvider: (id) => AIActivateProvider(id).then(() => {}),
      testConnection: async (id) => {
        try {
          await AITestConnection(id)
          return { success: true }
        } catch (e: unknown) {
          const err = e instanceof Error ? e : new Error(String(e))
          return { success: false, error: err.message }
        }
      },
      listConversations: async (params) => {
        const r = await AIListConversations(params?.page || 1, params?.page_size || 20)
        return bridge<{ items: AIConversation[]; total: number; page: number; page_size: number }>(r)
      },
      createConversation: async (data) => {
        const r = await AICreateConversation(data?.title || '')
        return bridge<AIConversation>(r)
      },
      getMessages: async (conversationId) => {
        const r = await AIGetMessages(conversationId)
        return bridge<AIMessage[]>(r)
      },
      deleteConversation: (id) => AIDeleteConversation(id).then(() => {}),
      analyzeRelationship: async (contactId) => {
        const r = await AIAnalyzeRelationship(contactId)
        return bridge<{ analysis: string }>({ analysis: r })
      },
      analyzeEvent: async (eventId) => {
        const r = await AIAnalyzeEvent(eventId)
        return bridge<{ analysis: string }>({ analysis: r })
      },
      analyzeComprehensive: async (data) => {
        const r = await AIAnalyzeComprehensive({
          type: data.type,
          contact_ids: data.contact_ids || [],
          event_ids: data.event_ids || [],
          question: data.question || '',
        } as unknown as bindings.AnalyzeComprehensiveInput)
        return bridge<{ analysis: string }>(r)
      },
      chat: async (conversationId, message) => {
        const r = await AIChatFn(conversationId, message)
        return bridge<string>(r)
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
        return bridge<Workspace[]>(r)
      },
      create: async (data) => {
        const { Create: WSCreate } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSCreate(data.name, data.description || '', data.icon || '')
        return bridge<Workspace>(r)
      },
      update: async (id, data) => {
        const { Update: WSUpdate } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSUpdate(id, data.name || '', data.description || '', data.icon || '')
        return bridge<Workspace>(r)
      },
      delete: async (id) => {
        const { Delete: WSDelete } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        await WSDelete(id)
      },
      switch: async (id) => {
        const { Switch: WSSwitch } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSSwitch(id)
        return bridge<Workspace>(r)
      },
      getDefault: async () => {
        const { GetDefault: WSGetDefault } = await import('@/wailsjs/go/bindings/WorkspaceBinding')
        const r = await WSGetDefault()
        return bridge<Workspace>(r)
      },
    },
  }
}

export { createWailsAdapters }
