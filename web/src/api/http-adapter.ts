import client from './client'
import type { AppAdapters } from './adapter'
import type { AuthResponse, User, Contact, Tag, Interaction, Reminder, ContactRelation, GraphData } from '@/types'

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
      list: (params) => client.get('/contacts', { params }).then(r => r.data),
      create: (data) => client.post('/contacts', data).then(r => r.data),
      getByID: (id) => client.get<Contact>(`/contacts/${id}`).then(r => r.data),
      update: (id, data) => client.put<Contact>(`/contacts/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/contacts/${id}`).then(() => {}),
      getTags: (id) => client.get<Tag[]>(`/contacts/${id}/tags`).then(r => r.data),
      replaceTags: (id, tagIDs) => client.put(`/contacts/${id}/tags`, { tag_ids: tagIDs }).then(() => {}),
    },

    tag: {
      list: () => client.get<Tag[]>('/tags').then(r => r.data),
      create: (data) => client.post<Tag>('/tags', data).then(r => r.data),
      update: (id, data) => client.put<Tag>(`/tags/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/tags/${id}`).then(() => {}),
    },

    interaction: {
      listByContact: (contactID, page, pageSize) =>
        client.get(`/contacts/${contactID}/interactions`, { params: { page, page_size: pageSize } }).then(r => r.data),
      create: (contactID, data) =>
        client.post<Interaction>(`/contacts/${contactID}/interactions`, data).then(r => r.data),
      update: (id, data) => client.put<Interaction>(`/interactions/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/interactions/${id}`).then(() => {}),
    },

    reminder: {
      list: (status) => client.get<Reminder[]>('/reminders', { params: { status } }).then(r => r.data),
      create: (contactID, data) =>
        client.post<Reminder>(`/contacts/${contactID}/reminders`, data).then(r => r.data),
      update: (id, data) => client.put<Reminder>(`/reminders/${id}`, data).then(r => r.data),
      delete: (id) => client.delete(`/reminders/${id}`).then(() => {}),
    },

    graph: {
      getGraph: () => client.get<GraphData>('/graph').then(r => r.data),
      getRelations: (contactID) => client.get<ContactRelation[]>(`/contacts/${contactID}/relations`).then(r => r.data),
      createRelation: (contactIDA, data) =>
        client.post<ContactRelation>(`/contacts/${contactIDA}/relations`, data).then(r => r.data),
      deleteRelation: (id) => client.delete(`/relations/${id}`).then(() => {}),
    },

    export: {
      exportJSON: () => client.post('/export').then(r => r.data),
      importJSON: (data) => client.post('/import', { data }).then(() => {}),
    },
  }
}

export { createHTTPAdapters }
