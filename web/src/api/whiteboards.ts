import { request } from './client'
import type { Whiteboard, WhiteboardDetail, WhiteboardEdge, WhiteboardNode, WhiteboardNodeInput, WhiteboardRelated } from '../types'

export const whiteboardsApi = {
  list: () =>
    request.get<Whiteboard[]>('/whiteboards').then((d) => ({ data: d })),

  create: (name: string) =>
    request.post<Whiteboard>('/whiteboards', { name }).then((d) => ({ data: d })),

  get: (id: number) =>
    request.get<WhiteboardDetail>(`/whiteboards/${id}`).then((d) => ({ data: d })),

  rename: (id: number, name: string) =>
    request.put<Whiteboard>(`/whiteboards/${id}`, { name }).then((d) => ({ data: d })),

  remove: (id: number) =>
    request.delete<void>(`/whiteboards/${id}`).then(() => {}),

  createNode: (boardId: number, data: WhiteboardNodeInput) =>
    request.post<WhiteboardNode>(`/whiteboards/${boardId}/nodes`, data).then((d) => ({ data: d })),

  updateNode: (boardId: number, nodeId: number, data: WhiteboardNodeInput) =>
    request.put<WhiteboardNode>(`/whiteboards/${boardId}/nodes/${nodeId}`, data).then((d) => ({ data: d })),

  deleteNode: (boardId: number, nodeId: number) =>
    request.delete<void>(`/whiteboards/${boardId}/nodes/${nodeId}`).then(() => {}),

  createEdge: (boardId: number, fromNodeId: number, toNodeId: number, label?: string) =>
    request.post<WhiteboardEdge>(`/whiteboards/${boardId}/edges`, { from_node_id: fromNodeId, to_node_id: toNodeId, label: label ?? '' }).then((d) => ({ data: d })),

  deleteEdge: (boardId: number, edgeId: number) =>
    request.delete<void>(`/whiteboards/${boardId}/edges/${edgeId}`).then(() => {}),

  expand: (boardId: number, nodeId: number) =>
    request.get<WhiteboardRelated[]>(`/whiteboards/${boardId}/nodes/${nodeId}/expand`).then((d) => ({ data: d })),
}
