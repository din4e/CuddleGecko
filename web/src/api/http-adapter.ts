import { request } from './client'
import type { AppAdapters, TodoImportResult } from './adapter'
import type { AuthResponse, User, Contact, Tag, Interaction, Reminder, ContactRelation, GraphData, Event, Transaction, TransactionSummary, AIProvider, AIConversation, AIMessage, Workspace, Todo } from '@/types'

function createHTTPAdapters(): AppAdapters {
  return {
    auth: {
      register: (username, email, password, captcha) =>
        request.post<AuthResponse>('/auth/register', { username, email, password, ...captcha }),
      login: (username, password, captcha) =>
        request.post<AuthResponse>('/auth/login', { username, password, ...captcha }),
      refresh: (refreshToken) =>
        request.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }),
      me: () => request.get<User>('/auth/me'),
    },

    captcha: {
      get: () => request.get<{ enabled: boolean; captcha_id?: string; captcha_image?: string }>('/captcha'),
    },

    contact: {
      list: (params) => request.get<{ items: Contact[]; total: number; page: number; page_size: number }>('/buddies', { params }),
      create: (data) => request.post<Contact>('/buddies', data),
      getByID: (id) => request.get<Contact>(`/buddies/${id}`),
      update: (id, data) => request.put<Contact>(`/buddies/${id}`, data),
      delete: (id) => request.delete<void>(`/buddies/${id}`).then(() => {}),
      getTags: (id) => request.get<Tag[]>(`/buddies/${id}/tags`),
      replaceTags: (id, tagIDs) => request.put<void>(`/buddies/${id}/tags`, { tag_ids: tagIDs }).then(() => {}),
    },

    tag: {
      list: () => request.get<{ items: Tag[]; total: number }>('/tags', { params: { page: 1, page_size: 200 } }).then((r) => r.items || []),
      create: (data) => request.post<Tag>('/tags', data),
      update: (id, data) => request.put<Tag>(`/tags/${id}`, data),
      delete: (id) => request.delete<void>(`/tags/${id}`).then(() => {}),
    },

    interaction: {
      listByContact: (contactID, page, pageSize) =>
        request.get<{ items: Interaction[]; total: number }>(`/buddies/${contactID}/interactions`, { params: { page, page_size: pageSize } }),
      create: (contactID, data) => request.post<Interaction>(`/buddies/${contactID}/interactions`, data),
      update: (id, data) => request.put<Interaction>(`/interactions/${id}`, data),
      delete: (id) => request.delete<void>(`/interactions/${id}`).then(() => {}),
    },

    reminder: {
      list: (status) => request.get<{ items: Reminder[]; total: number }>('/reminders', { params: { status, page: 1, page_size: 200 } }).then((r) => r.items || []),
      create: (contactID, data) => request.post<Reminder>(`/buddies/${contactID}/reminders`, data),
      update: (id, data) => request.put<Reminder>(`/reminders/${id}`, data),
      delete: (id) => request.delete<void>(`/reminders/${id}`).then(() => {}),
    },

    graph: {
      getGraph: () => request.get<GraphData>('/graph'),
      getRelations: (contactID) => request.get<ContactRelation[]>(`/buddies/${contactID}/relations`),
      createRelation: (contactIDA, data) => request.post<ContactRelation>(`/buddies/${contactIDA}/relations`, data),
      deleteRelation: (id) => request.delete<void>(`/relations/${id}`).then(() => {}),
    },

    export: {
      exportJSON: () => request.post<string>('/export'),
      exportTodosCSV: () => request.post<string>('/export/todos'),
      exportContactsCSV: () => request.post<string>('/export/contacts'),
      exportTransactionsCSV: () => request.post<string>('/export/transactions'),
      exportEventsCSV: () => request.post<string>('/export/events'),
      importJSON: (data) => request.post<void>('/import', { data }).then(() => {}),
      importTodosCSV: (data) => request.post<{ imported: number }>('/import/todos', { data }).then((r) => r.imported ?? 0),
      importContactsCSV: (data) => request.post<{ imported: number }>('/import/contacts', { data }).then((r) => r.imported ?? 0),
      importTransactionsCSV: (data) => request.post<{ imported: number }>('/import/transactions', { data }).then((r) => r.imported ?? 0),
      importTodosFromPlatform: (platform, data) => request.post<TodoImportResult>(`/import/todos/${platform}`, { data }).then((r) => r ?? { imported: 0, skipped: 0 }),
      exportModule: (module, format) => request.post<string>(`/data/export/${module}`, { format }),
      importModule: (module, format, data) => request.post<TodoImportResult>(`/data/import/${module}`, { data, format }).then((r) => r ?? { imported: 0, skipped: 0 }),
    },

    event: {
      list: (params) => request.get<{ items: Event[]; total: number; page: number; page_size: number }>('/events', { params }),
      create: (data) => request.post<Event>('/events', data),
      update: (id, data) => request.put<Event>(`/events/${id}`, data),
      delete: (id) => request.delete<void>(`/events/${id}`).then(() => {}),
    },

    todo: {
      list: (status) => request.get<Todo[]>('/todos', { params: { status } }),
      create: (data) => request.post<Todo>('/todos', data),
      update: (id, data) => request.put<Todo>(`/todos/${id}`, data),
      toggleStatus: (id) => request.patch<Todo>(`/todos/${id}/toggle`),
      syncToEvent: (id) => request.post<Event>(`/todos/${id}/sync-event`),
      delete: (id) => request.delete<void>(`/todos/${id}`).then(() => {}),
    },

    transaction: {
      list: (params) => request.get<{ items: Transaction[]; total: number; page: number; page_size: number }>('/transactions', { params }),
      summary: () => request.get<TransactionSummary>('/transactions/summary'),
      create: (data) => request.post<Transaction>('/transactions', data),
      update: (id, data) => request.put<Transaction>(`/transactions/${id}`, data),
      delete: (id) => request.delete<void>(`/transactions/${id}`).then(() => {}),
    },

    ai: {
      envProviderStatus: () => request.get<{ configured: boolean; provider_type: string; model: string; base_url: string }>('/ai/env-status'),
      listPresets: () => request.get<import('@/types').AIProviderPreset[]>('/ai/presets'),
      listProviders: () => request.get<AIProvider[]>('/ai/providers'),
      saveProvider: (data) => request.put<AIProvider>('/ai/providers', data),
      activateProvider: (id) => request.post<void>(`/ai/providers/${id}/activate`).then(() => {}),
      testConnection: (id) => request.post<{ success: boolean; error?: string }>(`/ai/providers/${id}/test`),
      listConversations: (params) => request.get<{ items: AIConversation[]; total: number; page: number; page_size: number }>('/ai/conversations', { params }),
      createConversation: (data) => request.post<AIConversation>('/ai/conversations', data),
      getMessages: (conversationId) => request.get<AIMessage[]>(`/ai/conversations/${conversationId}/messages`),
      deleteConversation: (id) => request.delete<void>(`/ai/conversations/${id}`).then(() => {}),
      analyzeRelationship: (contactId) => request.post<{ analysis: string }>(`/ai/analyze/relationship/${contactId}`),
      analyzeEvent: (eventId) => request.post<{ analysis: string }>(`/ai/analyze/event/${eventId}`),
      analyzeComprehensive: (data) => request.post<{ analysis: string }>('/ai/analyze', data),
      chat: (conversationId, message) => request.post<{ content: string }>('/ai/chat/sync', { conversation_id: conversationId, message }).then((r) => r.content),
    },

    workspace: {
      list: () => request.get<Workspace[]>('/workspaces'),
      create: (data) => request.post<Workspace>('/workspaces', data),
      update: (id, data) => request.put<Workspace>(`/workspaces/${id}`, data),
      delete: (id) => request.delete<void>(`/workspaces/${id}`).then(() => {}),
      switch: (id) => request.post<Workspace>(`/workspaces/${id}/switch`),
      getDefault: () => request.get<Workspace>('/workspaces/default'),
    },
  }
}

export { createHTTPAdapters }
