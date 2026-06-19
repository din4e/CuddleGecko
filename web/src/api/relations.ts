import { request } from './client'
import type { ContactRelation } from '../types'

export const relationsApi = {
  list: (contactId: number) =>
    request.get<ContactRelation[]>(`/buddies/${contactId}/relations`).then((data) => ({ data })),
  create: (contactId: number, data: { contact_id_b: number; relation_type: string }) =>
    request.post<ContactRelation>(`/buddies/${contactId}/relations`, data).then((d) => ({ data: d })),
  delete: (id: number) => request.delete<void>(`/relations/${id}`).then(() => {}),
}
