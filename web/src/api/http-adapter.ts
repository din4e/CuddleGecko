import client from './client'
import type { AppAdapters } from './adapter'
import type { AuthResponse, User, Contact, Tag, Interaction, Reminder, ContactRelation, GraphData, Event, Transaction, TransactionSummary, AIProvider, AIConversation, AIMessage, Workspace } from '@/types'

function createHTTPAdapters(): AppAdapters {
  return {
    auth: {
      register: (username, email, password, captcha) =>
        client.post<AuthResponse>('/auth/register', { username, email, password, ...captcha }).then(r => r.data),
      login: (username, password, captcha) =>
        client.post<AuthResponse>('/auth/login', { username, password, ...captcha }).then(r => r.data),
      refresh: (refreshToken) =>
        client.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }).then(r => r.data),
      me: () => client.get<User>('/auth/me').then(r => r.data),
    },

    captcha: {
      get: () => client.get('/captcha').then(r => r.data),
    },

    contact: {
      list: (params) => client.get('/buddies', { params }).then(r => r.data),
      create: (data) => client.post('/buddies', data).then(r => r.data),
      getByID: (id) => client.get<Contact>(`/buddies/${id}`).then(r => r.data),
      update: (id, data) => client.put<Contact>(`/buddies/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/buddies/${id}`).then(() => {}),
      getTags: (id) => client.get<Tag[]>(`/buddies/${id}/tags`).then(r => r.data),
      replaceTags: (id, tagIDs) => client.put(`/buddies/${id}/tags`, { tag_ids: tagIDs }).then(() => {}),
    },

    tag: {
      list: () => client.get<Tag[]>('/tags').then(r => r.data),
      create: (data) => client.post<Tag>('/tags', data).then(r => r.data),
      update: (id, data) => client.put<Tag>(`/tags/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/tags/${id}`).then(() => {}),
    },

    interaction: {
      listByContact: (contactID, page, pageSize) =>
        client.get(`/buddies/${contactID}/interactions`, { params: { page, page_size: pageSize } }).then(r => r.data),
      create: (contactID, data) =>
        client.post<Interaction>(`/buddies/${contactID}/interactions`, data).then(r => r.data),
      update: (id, data) => client.put<Interaction>(`/interactions/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/interactions/${id}`).then(() => {}),
    },

    reminder: {
      list: (status) => client.get<Reminder[]>('/reminders', { params: { status } }).then(r => r.data),
      create: (contactID, data) =>
        client.post<Reminder>(`/buddies/${contactID}/reminders`, data).then(r => r.data),
      update: (id, data) => client.put<Reminder>(`/reminders/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/reminders/${id}`).then(() => {}),
    },

    graph: {
      getGraph: () => client.get<GraphData>('/graph').then(r => r.data),
      getRelations: (contactID) => client.get<ContactRelation[]>(`/buddies/${contactID}/relations`).then(r => r.data),
      createRelation: (contactIDA, data) =>
        client.post<ContactRelation>(`/buddies/${contactIDA}/relations`, data).then(r => r.data),
      deleteRelation: (id) => client.delete(`/relations/${id}`).then(() => {}),
    },

    export: {
      exportJSON: () => client.post('/export').then(r => r.data),
      importJSON: (data) => client.post('/import', { data }).then(() => {}),
    },

    event: {
      list: (params) => client.get('/events', { params }).then(r => r.data),
      create: (data) => client.post<Event>('/events', data).then(r => r.data),
      update: (id, data) => client.put<Event>(`/events/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/events/${id}`).then(() => {}),
    },

    transaction: {
      list: (params) => client.get('/transactions', { params }).then(r => r.data),
      summary: () => client.get<TransactionSummary>('/transactions/summary').then(r => r.data),
      create: (data) => client.post<Transaction>('/transactions', data).then(r => r.data),
      update: (id, data) => client.put<Transaction>(`/transactions/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/transactions/${id}`).then(() => {}),
    },

    ai: {
      listPresets: () => client.get('/ai/presets').then(r => r.data),
      listProviders: () => client.get<AIProvider[]>('/ai/providers').then(r => r.data),
      saveProvider: (data) => client.put<AIProvider>('/ai/providers', data).then(r => r.data),
      activateProvider: (id) => client.post(`/ai/providers/${id}/activate`).then(() => {}),
      testConnection: (id) => client.post(`/ai/providers/${id}/test`).then(r => r.data),
      listConversations: (params) => client.get('/ai/conversations', { params }).then(r => r.data),
      createConversation: (data) => client.post<AIConversation>('/ai/conversations', data).then(r => r.data),
      getMessages: (conversationId) => client.get<AIMessage[]>(`/ai/conversations/${conversationId}/messages`).then(r => r.data),
      deleteConversation: (id) => client.delete(`/ai/conversations/${id}`).then(() => {}),
      analyzeRelationship: (contactId) => client.post(`/ai/analyze/relationship/${contactId}`).then(r => r.data),
      analyzeEvent: (eventId) => client.post(`/ai/analyze/event/${eventId}`).then(r => r.data),
      analyzeComprehensive: (data) => client.post('/ai/analyze', data).then(r => r.data),
      chat: (conversationId, message) => client.post<{ content: string }>('/ai/chat/sync', { conversation_id: conversationId, message }).then(r => r.data.content),
    },

    workspace: {
      list: () => client.get<Workspace[]>('/workspaces').then(r => r.data),
      create: (data) => client.post<Workspace>('/workspaces', data).then(r => r.data),
      update: (id, data) => client.put<Workspace>(`/workspaces/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/workspaces/${id}`).then(() => {}),
      switch: (id) => client.post<Workspace>(`/workspaces/${id}/switch`).then(r => r.data),
      getDefault: () => client.get<Workspace>('/workspaces/default').then(r => r.data),
    },
  }
}

export { createHTTPAdapters }
