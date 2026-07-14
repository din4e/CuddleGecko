import { useEffect, useMemo, useRef, useState, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d'
import type ForceGraph2DType from 'react-force-graph-2d'
import type { GraphData } from '@/types'
import { getNodeLabelColor } from '@/lib/constants'
import { getRecencyColor, RECENCY_STOPS } from '@/lib/graph'
import { Loader2, Network } from 'lucide-react'

// Compact relationship graph for the dashboard. Renders only the given "recent" contact ids
// (computed by the page from recent events/todos/transactions) plus their mutual relation edges
// and a self node — so node count stays bounded even for users with many buddies.
const ForceGraph2D = lazy(() => import('react-force-graph-2d')) as unknown as typeof ForceGraph2DType

const SELF_NODE_ID = -1
const avatarImageCache = new Map<string, HTMLImageElement>()

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

function loadAvatarImages(nodes: { avatar_url?: string }[]) {
  for (const n of nodes) {
    if (n.avatar_url && !avatarImageCache.has(n.avatar_url)) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = n.avatar_url
      img.onload = () => avatarImageCache.set(n.avatar_url!, img)
    }
  }
}

type GraphNodeData = {
  id: number
  name: string
  relationship_labels: string[]
  avatar_emoji?: string
  avatar_url?: string
  last_interaction_at?: string
}
type GraphNode = NodeObject<GraphNodeData>
type GraphLink = LinkObject<GraphNodeData, { relation_type: string }>

interface Props {
  graphData: GraphData | null
  recentIds: Set<number>
  height?: number
}

export function DashboardNetworkWidget({ graphData, recentIds, height = 320 }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { nodes, links } = useMemo(() => {
    if (!graphData || recentIds.size === 0) return { nodes: [], links: [] }
    const ns = graphData.nodes.filter((n) => recentIds.has(n.id))
    const ids = new Set(ns.map((n) => n.id))
    const es = graphData.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    loadAvatarImages(ns)
    const self = {
      id: SELF_NODE_ID,
      name: t('graph.me'),
      relationship_labels: [] as string[],
      avatar_emoji: '',
      avatar_url: '',
    }
    const selfLinks = ns.map((n) => ({ source: SELF_NODE_ID, target: n.id, relation_type: '' }))
    return {
      nodes: [...ns, self],
      links: [
        ...es.map((e) => ({ source: e.source, target: e.target, relation_type: e.relation_type })),
        ...selfLinks,
      ],
    }
  }, [graphData, recentIds, t])

  const dark = isDarkMode()

  const nodeCanvasObject = (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x
    const y = node.y
    if (x == null || y == null) return
    const isSelf = node.id === SELF_NODE_ID
    const r = (isSelf ? 9 : 7) / Math.sqrt(globalScale)
    const color = isSelf ? '#10b981' : getRecencyColor(node.last_interaction_at)
    const bgColor = dark ? '#1f2937' : '#ffffff'

    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = bgColor
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2 / globalScale
    ctx.stroke()

    const emoji = node.avatar_emoji as string | undefined
    const avatarUrl = node.avatar_url as string | undefined
    const avatarImg = avatarUrl ? avatarImageCache.get(avatarUrl) : null
    if (avatarImg) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r - 1 / globalScale, 0, 2 * Math.PI)
      ctx.clip()
      ctx.drawImage(avatarImg, x - r, y - r, r * 2, r * 2)
      ctx.restore()
    } else if (emoji) {
      ctx.font = `${r * 1.1}px Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, x, y)
    } else {
      ctx.font = `bold ${r * 1.1}px Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = color
      ctx.fillText(node.name?.[0] || '?', x, y)
    }

    // The recent-contact subgraph is small/bounded → always show name labels.
    ctx.font = `${11 / globalScale}px Sans-Serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = isSelf ? '#10b981' : dark ? '#e5e7eb' : '#1f2937'
    ctx.fillText(node.name, x, y + r + 2 / globalScale)
  }

  if (!graphData) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('graph.loading')}
      </div>
    )
  }

  if (nodes.length <= 1) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Network className="h-10 w-10 opacity-30" />
        <span className="text-sm">{t('dashboard.networkEmpty')}</span>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="w-full">
      <ForceGraph2D<GraphNodeData, { relation_type: string }>
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeLabel="name"
        nodeColor={(n: GraphNode) =>
          n.id === SELF_NODE_ID ? '#10b981' : getRecencyColor(n.last_interaction_at)
        }
        linkColor={(l: GraphLink) =>
          l.relation_type ? getNodeLabelColor(l.relation_type) : dark ? '#374151' : '#d1d5db'
        }
        linkWidth={(l: GraphLink) => (l.relation_type ? 1.5 : 0.5)}
        linkLineDash={(l: GraphLink) => (l.relation_type ? null : [4, 4])}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(n: GraphNode) => {
          if (n.id !== SELF_NODE_ID) navigate(`/buddies/${n.id}`)
        }}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          const x = node.x
          const y = node.y
          if (x == null || y == null) return
          ctx.beginPath()
          ctx.arc(x, y, 11, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
        }}
        width={width}
        height={height}
        backgroundColor={dark ? '#111827' : 'transparent'}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(300, 30)}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-muted-foreground">
        {RECENCY_STOPS.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {t(s.label)}
          </span>
        ))}
      </div>
    </div>
  )
}
