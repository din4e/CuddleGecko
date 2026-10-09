import { request } from './client'
import type { ContactRelation } from '../types'

export const relationsApi = {
  list: (contactId: string) =>
    request.get<ContactRelation[]>(`/buddies/${contactId}/relations`).then((data) => ({ data })),
  create: (contactId: string, data: { contact_id_b: string; relation_type: string }) =>
    request.post<ContactRelation>(`/buddies/${contactId}/relations`, data).then((d) => ({ data: d })),
  delete: (id: string) => request.delete<void>(`/relations/${id}`).then(() => {}),
}
