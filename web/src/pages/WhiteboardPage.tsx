import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Connection, type Edge, type Node, type NodeMouseHandler, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Trash2, Pencil, Loader2 } from 'lucide-react'
import ListPageHeader from '../components/ListPageHeader'
import EmptyState from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { BoardNode, type BoardNodeData } from '../components/whiteboard/BoardNode'
import { AddNodeDialog } from '../components/whiteboard/AddNodeDialog'
import {
  useWhiteboardsList, useWhiteboard, useCreateWhiteboard, useRenameWhiteboard, useDeleteWhiteboard,
  useWhiteboardNodeMutations,
} from '../hooks/api/useWhiteboards'
import { whiteboardsApi } from '../api/whiteboards'
import { useContactsList } from '../hooks/api/useContacts'
import { useTodosList } from '../hooks/api/useTodos'
import { useEventsList } from '../hooks/api/useEvents'
import { useWorkoutsList } from '../hooks/api/useWorkouts'
import type { WhiteboardDetail, WhiteboardNode, WhiteboardNodeInput } from '../types'

const nodeTypes = { board: BoardNode }

const toEdge = (id: number, source: number, target: number, label: string): Edge => ({
  id: String(id), source: String(source), target: String(target), label: label || undefined,
})

function BoardCanvas({ board, onNodeClick }: {
  board: WhiteboardDetail
  onNodeClick: (nodeId: number | null) => void
}) {
  const { createNode, updateNode, deleteNode, createEdge, deleteEdge } = useWhiteboardNodeMutations(board.id)
  // mutation object identities change every render — bind the stable fns so
  // downstream callbacks/effects don't loop (Maximum update depth).
  const createNodeAsync = createNode.mutateAsync
  const createEdgeAsync = createEdge.mutateAsync
  const createEdgeMutate = createEdge.mutate
  const updateNodeMutate = updateNode.mutate
  const deleteNodeMutate = deleteNode.mutate

  const expandNode = useCallback(async (nodeId: number) => {
    const parent = board.nodes.find((n) => n.id === nodeId)
    if (!parent) return
    const res = await whiteboardsApi.expand(board.id, nodeId)
    // skip related items already on the board
    const existing = new Set(board.nodes.filter((n) => n.ref_id).map((n) => `${n.ref_type}:${n.ref_id}`))
    const fresh = res.data.filter((r) => !existing.has(`${r.ref_type}:${r.ref_id}`))
    const radius = 260
    for (let i = 0; i < fresh.length; i++) {
      const rel = fresh[i]
      const angle = (Math.PI * 2 * i) / Math.max(1, fresh.length) - Math.PI / 2
      const node = await createNodeAsync({
        ref_type: rel.ref_type, ref_id: rel.ref_id, label: rel.label,
        x: Math.round(parent.x + radius * Math.cos(angle)),
        y: Math.round(parent.y + radius * Math.sin(angle)),
      })
      await createEdgeAsync({ from: nodeId, to: node.data.id })
    }
  }, [board, createNodeAsync, createEdgeAsync])

  const toFlowNode = useCallback((n: WhiteboardNode): Node => ({
    id: String(n.id),
    type: 'board',
    position: { x: n.x, y: n.y },
    data: {
      refType: n.ref_type || 'note',
      label: n.label,
      note: n.note,
      color: n.color,
      hasRef: !!(n.ref_id && n.ref_type && n.ref_type !== 'note'),
      onExpand: (id: string) => { void expandNode(Number(id)) },
      onDelete: (id: string) => { deleteNodeMutate(Number(id)) },
    } satisfies BoardNodeData,
  }), [expandNode, deleteNodeMutate])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // sync from server whenever the board payload changes (create/delete/expand
  // refetch the board query; drags patch positions locally first)
  useEffect(() => {
    setNodes(board.nodes.map(toFlowNode))
    setEdges(board.edges.map((e) => toEdge(e.id, e.from_node_id, e.to_node_id, e.label)))
  }, [board, toFlowNode, setNodes, setEdges])

  const onConnect = useCallback((conn: Connection) => {
    createEdgeMutate({ from: Number(conn.source), to: Number(conn.target) })
  }, [createEdgeMutate])

  // persist drag end: the final position change carries dragging === false
  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChange(changes)
    for (const ch of changes) {
      if (ch.type === 'position' && !ch.dragging && ch.position) {
        const n = board.nodes.find((x) => x.id === Number(ch.id))
        if (!n) continue
        updateNodeMutate({
          nodeId: n.id,
          data: { label: n.label, note: n.note, color: n.color, x: ch.position.x, y: ch.position.y },
        })
      }
    }
  }, [onNodesChange, board.nodes, updateNodeMutate])

  const onPaneClick = useCallback(() => onNodeClick(null), [onNodeClick])
  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => onNodeClick(Number(node.id)), [onNodeClick])

  return (
    <div className="h-[calc(100vh-13rem)] min-h-[28rem] w-full overflow-hidden rounded-lg border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        onEdgeDoubleClick={(_, edge) => deleteEdge.mutate(Number(edge.id))}
        fitView
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
        <Controls position="bottom-left" />
        <MiniMap pannable zoomable className="!bg-muted/40" />
      </ReactFlow>
    </div>
  )
}

/** Side panel: edit a node's title/note; entity nodes also show the link. */
function NodeDetailPanel({ board, nodeId }: { board: WhiteboardDetail; nodeId: number }) {
  const { t } = useTranslation()
  const node = board.nodes.find((n) => n.id === nodeId)
  const { updateNode } = useWhiteboardNodeMutations(board.id)
  // keyed remount (see usage) keeps local draft state per node — no effect sync
  const [label, setLabel] = useState(node?.label ?? '')
  const [note, setNote] = useState(node?.note ?? '')

  const { data: contacts } = useContactsList({ page_size: 100 })
  const { data: todos } = useTodosList({ page_size: 100 })
  const { data: events } = useEventsList({ page_size: 100 })
  const { data: workouts } = useWorkoutsList({ page_size: 100 })

  const linkedName = useMemo(() => {
    if (!node?.ref_id) return null
    switch (node.ref_type) {
      case 'contact': return contacts?.items?.find((c) => c.id === node.ref_id)?.name
      case 'todo': return todos?.items?.find((x) => x.id === node.ref_id)?.title
      case 'event': return events?.items?.find((x) => x.id === node.ref_id)?.title
      case 'workout': return workouts?.items?.find((x) => x.id === node.ref_id)?.name
      default: return null
    }
  }, [node, contacts, todos, events, workouts])

  if (!node) return null
  const dirty = label !== node.label || note !== node.note

  const save = () => {
    updateNode.mutate({
      nodeId: node.id,
      data: { label, note, color: node.color, x: node.x, y: node.y },
    })
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('whiteboard.detail')}</p>
        <span className="text-[10px] text-muted-foreground">{t(`whiteboard.kind_${node.ref_type || 'note'}`)}</span>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t('whiteboard.titleLabel')}</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t('whiteboard.noteBody')}</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} className="text-sm" />
      </div>
      {linkedName && (
        <p className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
          {t('whiteboard.linkedEntity')}: {linkedName}
        </p>
      )}
      <Button size="sm" onClick={save} disabled={!dirty || (!label.trim() && !node.ref_id)}>
        <Pencil className="mr-1 h-3.5 w-3.5" />{t('common.save')}
      </Button>
    </div>
  )
}

function WhiteboardPageInner() {
  const { t } = useTranslation()
  const { data: boards, isLoading } = useWhiteboardsList()
  const createBoard = useCreateWhiteboard()
  const renameBoard = useRenameWhiteboard()
  const deleteBoard = useDeleteWhiteboard()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null)
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const list = boards ?? []
  const current = activeId ?? list[0]?.id ?? null
  const { data: currentBoard } = useWhiteboard(current)
  const { createNode } = useWhiteboardNodeMutations(current)

  const handleCreate = async () => {
    if (!newName.trim()) return
    const res = await createBoard.mutateAsync(newName.trim())
    setNewName('')
    setNewBoardOpen(false)
    setActiveId(res.data.id)
  }

  const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm'

  return (
    <div className="space-y-4">
      <ListPageHeader
        title={t('whiteboard.title')}
        actions={
          <Button
            disabled={current == null}
            onClick={() => {
              // stagger successive drops so new elements don't stack on one spot
              const count = currentBoard?.nodes.length ?? 0
              setAddAt({ x: 200 + (count % 4) * 100, y: 200 + Math.floor(count / 4) * 100 })
            }}
          >
            <Plus className="mr-2 h-4 w-4" />{t('whiteboard.addNode')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${selectCls} min-w-44`}
          value={current ?? ''}
          onChange={(e) => { setActiveId(Number(e.target.value)); setSelectedNode(null) }}
          aria-label={t('whiteboard.selectBoard')}
        >
          {list.length === 0 && <option value="">{t('whiteboard.noBoards')}</option>}
          {list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {currentBoard && (
          <Input
            className="h-9 w-44"
            defaultValue={currentBoard.name}
            key={`rename-${currentBoard.id}`}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== currentBoard.name) renameBoard.mutate({ id: currentBoard.id, name })
            }}
            aria-label={t('whiteboard.boardName')}
          />
        )}
        <Button variant="outline" size="sm" onClick={() => setNewBoardOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />{t('whiteboard.createBoard')}
        </Button>
        {current != null && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmDelete(current)}>
            <Trash2 className="mr-1 h-4 w-4" />{t('whiteboard.deleteBoard')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : current == null || !currentBoard ? (
        <EmptyState message={t('whiteboard.noBoards')} />
      ) : (
        <div className="flex items-stretch gap-4">
          <div className="min-w-0 flex-1">
            <BoardCanvas board={currentBoard} onNodeClick={setSelectedNode} />
          </div>
          {selectedNode != null && currentBoard.nodes.some((n) => n.id === selectedNode) ? (
            <NodeDetailPanel key={selectedNode} board={currentBoard} nodeId={selectedNode} />
          ) : (
            <div className="flex w-72 shrink-0 items-center justify-center rounded-lg border border-dashed bg-card/50 p-3 text-xs text-muted-foreground">
              {t('whiteboard.selectNodeHint')}
            </div>
          )}
        </div>
      )}

      {addAt && current != null && (
        <AddNodeDialog
          open
          at={addAt}
          onClose={() => setAddAt(null)}
          onAdd={async (input: WhiteboardNodeInput) => { await createNode.mutateAsync(input) }}
        />
      )}

      <Dialog open={newBoardOpen} onOpenChange={setNewBoardOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('whiteboard.createBoard')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t('whiteboard.newBoardName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
            aria-label={t('whiteboard.boardName')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewBoardOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createBoard.isPending}>
              {createBoard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete != null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        message={t('whiteboard.deleteBoardConfirm')}
        onConfirm={async () => {
          if (confirmDelete != null) {
            await deleteBoard.mutateAsync(confirmDelete)
            if (activeId === confirmDelete) setActiveId(null)
            setConfirmDelete(null)
          }
        }}
      />
    </div>
  )
}

export default function WhiteboardPage() {
  return (
    <ReactFlowProvider>
      <WhiteboardPageInner />
    </ReactFlowProvider>
  )
}
