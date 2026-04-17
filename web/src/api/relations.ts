import client from './client'
import type { ContactRelation } from '../types'

export const relationsApi = {
  list: (contactId: number) => client.get<ContactRelation[]>(`/contacts/${contactId}/relations`),
  create: (contactId: number, data: { contact_id_b: number; relation_type: string }) =>
    client.post<ContactRelation>(`/contacts/${contactId}/relations`, data),
  delete: (id: number) => client.delete(`/relations/${id}`),
}
