import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { whiteboardsApi } from '../../api/whiteboards'
import { mutationErrorToast } from '../../lib/toast'
import { rootKey } from './keys'
import { invalidateScope } from '@/lib/querySync'
import type { WhiteboardNodeInput } from '../../types'

const scope = 'whiteboards'
const allKey = () => [scope, ...rootKey(scope).slice(1)] as const
const boardKey = (id: number) => [...allKey(), 'board', id] as const

export function useWhiteboardsList() {
  return useQuery({
    queryKey: [...allKey(), 'list'] as const,
    queryFn: () => whiteboardsApi.list().then((r) => r.data),
  })
}

export function useWhiteboard(id: number | null) {
  return useQuery({
    queryKey: boardKey(id ?? 0),
    queryFn: () => whiteboardsApi.get(id!).then((r) => r.data),
    enabled: id != null,
  })
}

export function useCreateWhiteboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => whiteboardsApi.create(name),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

export function useRenameWhiteboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => whiteboardsApi.rename(id, name),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

export function useDeleteWhiteboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => whiteboardsApi.remove(id),
    onSuccess: () => invalidateScope(qc, scope),
    onError: mutationErrorToast,
  })
}

/** Node mutations patch the single board query instead of refetching. */
export function useWhiteboardNodeMutations(boardId: number | null) {
  const qc = useQueryClient()
  const key = boardKey(boardId ?? 0)

  const createNode = useMutation({
    mutationFn: (data: WhiteboardNodeInput) => whiteboardsApi.createNode(boardId!, data),
    onSettled: () => invalidateScope(qc, scope),
  })
  const updateNode = useMutation({
    mutationFn: ({ nodeId, data }: { nodeId: number; data: WhiteboardNodeInput }) =>
      whiteboardsApi.updateNode(boardId!, nodeId, data),
    // position drags are frequent — reconcile silently
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => {}, // no toast spam for drag saves
  })
  const deleteNode = useMutation({
    mutationFn: (nodeId: number) => whiteboardsApi.deleteNode(boardId!, nodeId),
    onSettled: () => invalidateScope(qc, scope),
  })
  const createEdge = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) => whiteboardsApi.createEdge(boardId!, from, to),
    onSettled: () => invalidateScope(qc, scope),
  })
  const deleteEdge = useMutation({
    mutationFn: (edgeId: number) => whiteboardsApi.deleteEdge(boardId!, edgeId),
    onSettled: () => invalidateScope(qc, scope),
  })

  return { createNode, updateNode, deleteNode, createEdge, deleteEdge }
}
