import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d'
import type ForceGraph2DType from 'react-force-graph-2d'
import { graphApi } from '../api/graph'
import type { GraphData } from '../types'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { useGraphSettings } from '../stores/graphSettings'
import { getNodeLabelColor } from '../lib/constants'
import { getRecencyColor, RECENCY_STOPS } from '../lib/graph'
import { ZoomIn, ZoomOut, Maximize, Minimize, RotateCcw, Crosshair, Loader2, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import EmptyState from '../components/EmptyState'

const ForceGraph2D = lazy(() => import('react-force-graph-2d')) as unknown as typeof ForceGraph2DType

type LayoutMode = 'force' | 'cluster' | 'random'

const avatarImageCache = new Map<string, HTMLImageElement>()

function loadAvatarImages(nodes: { avatar_url?: string }[]) {
  for (const node of nodes) {
    if (node.avatar_url && !avatarImageCache.has(node.avatar_url)) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = node.avatar_url
      img.onload = () => avatarImageCache.set(node.avatar_url!, img)
    }
  }
}

function getNodeColor(labels: string[]): string {
  if (labels && labels.length > 0) return getNodeLabelColor(labels[0])
  return '#6b7280'
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

const SELF_NODE_ID = -1
const LARGE_GRAPH_THRESHOLD = 300

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-sm px-2.5 py-1 font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

type GraphNodeData = {
  id: number
  name: string
  relationship_labels: string[]
  avatar_emoji?: string
  avatar_url?: string
  last_interaction_at?: string
  __isCenter?: boolean
  __cluster?: string
}
type GraphNode = NodeObject<GraphNodeData>
type GraphLink = LinkObject<GraphNodeData, { relation_type: string }>

export default function GraphPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const recenterTimerRef = useRef<number | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'label' | 'relation'>('label')
  const [showSelf, setShowSelf] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
  const [colorMode, setColorMode] = useState<'label' | 'recency'>('label')
  const nodeRadius = useGraphSettings((s) => s.nodeRadius)
  const emojiSizeSetting = useGraphSettings((s) => s.emojiSize)

  const handleZoomIn = useCallback(() => {
    if (fgRef.current) {
      const fg = fgRef.current
      const currentZoom = fg.zoom()
      fg.zoom(currentZoom * 1.4, 200)
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (fgRef.current) {
      const fg = fgRef.current
      const currentZoom = fg.zoom()
      fg.zoom(currentZoom / 1.4, 200)
    }
  }, [])

  const handleFitAll = useCallback(() => {
    fgRef.current?.zoomToFit(400, 40)
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  useEffect(() => {
    graphApi.get()
      .then((res) => {
        setGraphData(res.data)
        if (res.data?.nodes) loadAvatarImages(res.data.nodes)
      })
      .finally(() => setLoading(false))
  }, [])

  // Measure container size from its live rect. Falls back to viewport in
  // fullscreen. Setting state with the same values is a no-op via the
  // equality check, so downstream consumers aren't re-rendered needlessly.
  const measureContainer = useCallback(() => {
    if (isFullscreen) {
      setDimensions((prev) =>
        prev.width === window.innerWidth && prev.height === window.innerHeight
          ? prev
          : { width: window.innerWidth, height: window.innerHeight },
      )
      return
    }
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(200, Math.floor(rect.width))
    // Leave 24px under the canvas so the wrapping Card's bottom padding
    // (py-4 = 16px) plus its ring/shadow stays inside the viewport instead
    // of leaking below the browser's bottom edge. No min-height clamp:
    // at very small viewports the header alone eats most of the space,
    // and clamping would force the card below the viewport.
    const height = Math.max(80, Math.floor(window.innerHeight - rect.top - 24))
    setDimensions((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
  }, [isFullscreen])

  // After dimensions settle, debounced re-center so the user doesn't lose
  // their graph in a resized viewport.
  const scheduleRecenter = useCallback(() => {
    if (recenterTimerRef.current != null) window.clearTimeout(recenterTimerRef.current)
    recenterTimerRef.current = window.setTimeout(() => {
      recenterTimerRef.current = null
      fgRef.current?.zoomToFit(400, 40)
    }, 220)
  }, [])

  // Callback ref: fires when the container mounts/unmounts, so we attach
  // the ResizeObserver at the right moment even if Suspense delays the
  // initial mount.
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    if (!el) return
    measureContainer()
    const ro = new ResizeObserver(measureContainer)
    ro.observe(el)
    resizeObserverRef.current = ro
  }, [measureContainer])

  useEffect(() => {
    // Catch viewport changes that don't grow the container itself (e.g. body
    // height shrinks because a sibling collapsed). In fullscreen the
    // document.documentElement observer already covers this via measureContainer.
    window.addEventListener('resize', measureContainer)
    return () => {
      window.removeEventListener('resize', measureContainer)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (recenterTimerRef.current != null) {
        window.clearTimeout(recenterTimerRef.current)
        recenterTimerRef.current = null
      }
    }
  }, [measureContainer])

  // Re-measure when toggling fullscreen, then recenter.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      measureContainer()
      scheduleRecenter()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isFullscreen, measureContainer, scheduleRecenter])

  // Debounced recenter on dimension change.
  useEffect(() => {
    scheduleRecenter()
  }, [dimensions, scheduleRecenter])

  // Escape to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (node.id === SELF_NODE_ID) return
    navigate(`/buddies/${node.id}`)
  }, [navigate])

  // Collect all unique labels and relation types
  const { usedLabels, usedRelationTypes } = useMemo(() => {
    const labels = new Set<string>()
    const relTypes = new Set<string>()
    if (graphData) {
      graphData.nodes.forEach((n) => (n.relationship_labels || []).forEach((l) => labels.add(l)))
      graphData.edges.forEach((e) => { if (e.relation_type) relTypes.add(e.relation_type) })
    }
    return { usedLabels: labels, usedRelationTypes: relTypes }
  }, [graphData])

  const selfNodeName = useMemo(() => t('graph.me'), [t])

  // Build filtered data with layout positioning
  const fgData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [], linkCounts: new Map(), isLarge: false }

    let nodes = [...graphData.nodes]
    let edges = [...graphData.edges]

    if (activeFilters.size > 0) {
      if (filterMode === 'label') {
        nodes = nodes.filter((n) => (n.relationship_labels || []).some((l) => activeFilters.has(l)))
      } else {
        const matchingEdges = edges.filter((e) => activeFilters.has(e.relation_type))
        const connectedIds = new Set<number>()
        matchingEdges.forEach((e) => { connectedIds.add(e.source); connectedIds.add(e.target) })
        nodes = nodes.filter((n) => connectedIds.has(n.id))
        edges = matchingEdges
      }
    }

    const nodeIds = new Set(nodes.map((n) => n.id))
    edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

    // Precompute link counts before adding self node
    const linkCounts = new Map<number, number>()
    for (const e of edges) {
      linkCounts.set(e.source, (linkCounts.get(e.source) || 0) + 1)
      linkCounts.set(e.target, (linkCounts.get(e.target) || 0) + 1)
    }

    const isLarge = nodes.length > LARGE_GRAPH_THRESHOLD

    // Add self node — for large graphs only connect to nodes with edges
    if (showSelf && nodes.length > 0) {
      const targets = isLarge
        ? nodes.filter((n) => (linkCounts.get(n.id) || 0) > 0).slice(0, 50)
        : nodes
      if (targets.length > 0) {
        nodes.push({ id: SELF_NODE_ID, name: selfNodeName, relationship_labels: [], avatar_emoji: '', avatar_url: '' })
        targets.forEach((n) => {
          if (n.id !== SELF_NODE_ID) {
            edges.push({ source: SELF_NODE_ID, target: n.id, relation_type: '' })
          }
        })
      }
    }

    // Apply layout positions
    const layoutNodes = nodes.map((n) => {
      const base: GraphNode = { ...n, id: n.id }

      if (layoutMode === 'cluster' && n.id !== SELF_NODE_ID) {
        const label = n.relationship_labels?.[0] || '_none'
        return { ...base, __cluster: label }
      }

      if (layoutMode === 'random' && n.id !== SELF_NODE_ID) {
        const spread = Math.sqrt(nodes.length) * 25
        return {
          ...base,
          x: (pseudoRandom(n.id) - 0.5) * spread * 2,
          y: (pseudoRandom(n.id + 10000) - 0.5) * spread * 2,
        }
      }

      return base
    })

    // For cluster mode, compute cluster center positions and assign
    if (layoutMode === 'cluster') {
      const clusterMap = new Map<string, number[]>()
      const layoutById = new Map<number, GraphNode>()
      layoutNodes.forEach((n: GraphNode) => {
        if (n.id === SELF_NODE_ID) return
        layoutById.set(n.id, n)
        const key = n.__cluster || '_none'
        let arr = clusterMap.get(key)
        if (!arr) { arr = []; clusterMap.set(key, arr) }
        arr.push(n.id)
      })

      const clusters = [...clusterMap.entries()]
      const clusterRadius = Math.sqrt(nodes.length) * 20

      clusters.forEach(([, memberIds], ci) => {
        const angle = (2 * Math.PI * ci) / clusters.length - Math.PI / 2
        const cx = Math.cos(angle) * clusterRadius
        const cy = Math.sin(angle) * clusterRadius
        const innerSpread = Math.sqrt(memberIds.length) * 10

        memberIds.forEach((id) => {
          const node = layoutById.get(id)
          if (node) {
            node.x = cx + (pseudoRandom(id + 20000) - 0.5) * innerSpread * 2
            node.y = cy + (pseudoRandom(id + 30000) - 0.5) * innerSpread * 2
          }
        })
      })

      // Position self node at center
      const selfNode = layoutById.get(SELF_NODE_ID) ?? layoutNodes.find((n: GraphNode) => n.id === SELF_NODE_ID)
      if (selfNode) {
        selfNode.x = 0
        selfNode.y = 0
      }
    }

    return {
      nodes: layoutNodes,
      links: edges.map((e) => ({ source: e.source, target: e.target, relation_type: e.relation_type })),
      linkCounts,
      isLarge,
    }
  }, [graphData, activeFilters, filterMode, showSelf, selfNodeName, layoutMode])

  const handleCenter = useCallback(() => {
    let cx = 0, cy = 0, count = 0
    for (const n of fgData.nodes) {
      if (n.x != null && n.y != null) {
        cx += n.x
        cy += n.y
        count++
      }
    }
    if (count === 0) return
    cx /= count
    cy /= count
    fgRef.current?.centerAt(cx, cy, 400)
  }, [fgData.nodes])

  const dark = isDarkMode()
  const isLarge = fgData.isLarge

  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x
    const y = node.y
    if (x == null || y == null) return
    const isSelf = node.id === SELF_NODE_ID
    const emoji = node.avatar_emoji as string | undefined
    const hasEmoji = emoji && emoji.length > 0

    const baseRadius = isSelf ? nodeRadius + 4 : nodeRadius
    const r = baseRadius / Math.sqrt(globalScale)
    const fontSize = (isSelf ? 12 : 11) / globalScale
    const emojiSize = (isSelf ? emojiSizeSetting + 4 : emojiSizeSetting) / globalScale

    const color = isSelf
      ? '#10b981'
      : colorMode === 'recency'
        ? getRecencyColor(node.last_interaction_at)
        : getNodeColor(node.relationship_labels)
    const bgColor = dark ? '#1f2937' : '#ffffff'
    const textColor = dark ? '#e5e7eb' : '#1f2937'

    if (isSelf) {
      ctx.shadowColor = '#10b981'
      ctx.shadowBlur = 12 / globalScale
    }

    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = bgColor
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2 / globalScale
    ctx.stroke()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    const avatarUrl = node.avatar_url as string | undefined
    const avatarImg = avatarUrl ? avatarImageCache.get(avatarUrl) : null
    if (avatarImg) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r - 1 / globalScale, 0, 2 * Math.PI)
      ctx.clip()
      ctx.drawImage(avatarImg, x - r, y - r, r * 2, r * 2)
      ctx.restore()
    } else if (hasEmoji) {
      ctx.font = `${emojiSize}px Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, x, y)
    } else {
      ctx.font = `bold ${r * 1.2}px Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = color
      ctx.fillText(node.name?.[0] || '?', x, y)
    }

    // Skip name labels when zoomed out on large graphs
    if (!isLarge || globalScale > 0.6) {
      ctx.font = `${fontSize}px Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = isSelf ? '#10b981' : textColor
      ctx.fillText(node.name, x, y + r + 2 / globalScale)
    }
  }, [nodeRadius, emojiSizeSetting, dark, isLarge, colorMode])

  // Reheat simulation and adjust forces when switching layout
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    if (layoutMode === 'cluster') {
      fg.d3Force('charge')?.strength(-20)
      fg.d3Force('link')?.distance(20)
    }
    if (isLarge) {
      fg.d3Force('charge')?.strength(-40)
      fg.d3Force('link')?.distance(15)
    }
    fg.d3ReheatSimulation()
  }, [layoutMode, isLarge])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t('graph.title')}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('graph.loading')}
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="flex h-[60vh] w-full items-center justify-center bg-muted/20">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="relative">
                  <Network className="h-12 w-12 opacity-30" />
                  <Loader2 className="absolute -right-1 -top-1 h-5 w-5 animate-spin text-primary" />
                </div>
                <span className="text-sm">{t('graph.loading')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t('graph.title')}</h1>
        <EmptyState message={t('graph.empty')} />
      </div>
    )
  }

  const relLabels: Record<string, string> = {
    family: t('relationships.family'),
    friend: t('relationships.friend'),
    colleague: t('relationships.colleague'),
    client: t('relationships.client'),
    pet: t('relationships.pet'),
    other: t('relationships.other'),
  }

  const cooldownTicks = layoutMode === 'random' ? 0 : (isLarge ? 200 : 100)

  const layoutOptions: { value: LayoutMode; label: string }[] = [
    { value: 'force', label: t('graph.layoutForce') },
    { value: 'cluster', label: t('graph.layoutCluster') },
    { value: 'random', label: t('graph.layoutRandom') },
  ]

  const colorModeOptions = [
    { value: 'label' as const, label: t('graph.colorLabel') },
    { value: 'recency' as const, label: t('graph.colorRecency') },
  ]

  const filterModeOptions = [
    { value: 'label' as const, label: t('graph.filterByLabel') },
    { value: 'relation' as const, label: t('graph.filterByRelation') },
  ]

  const visibleNodeCount = fgData.nodes.length - (showSelf ? 1 : 0)

  const zoomButtons = (
    <>
      <Button variant="outline" size="icon" className="size-8" onClick={handleZoomIn} title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')}>
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="size-8" onClick={handleZoomOut} title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')}>
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="size-8" onClick={handleFitAll} title={t('graph.fitAll')} aria-label={t('graph.fitAll')}>
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="size-8" onClick={handleCenter} title={t('graph.center')} aria-label={t('graph.center')}>
        <Crosshair className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="size-8" onClick={toggleFullscreen} title={isFullscreen ? t('graph.exitFullscreen') : t('graph.fullscreen')} aria-label={isFullscreen ? t('graph.exitFullscreen') : t('graph.fullscreen')}>
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </Button>
    </>
  )

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'space-y-4'}>
      {isFullscreen && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 shadow-md backdrop-blur-md">
            <span className="text-sm font-medium">{t('graph.title')}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {visibleNodeCount}/{graphData.nodes.length}
            </span>
            <div className="mx-1 h-4 w-px bg-border" />
            <div className="flex items-center gap-1">{zoomButtons}</div>
          </div>
        </div>
      )}

      {!isFullscreen && (
        <>
          {/* Row 1: Title + stats + zoom controls */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{t('graph.title')}</h1>
              <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-xs tabular-nums">
                <Network className="h-3 w-3" />
                {visibleNodeCount} / {graphData.nodes.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showSelf ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowSelf(!showSelf)}
              >
                {showSelf ? t('graph.hideSelf') : t('graph.showSelf')}
              </Button>
              <div className="flex items-center gap-1">{zoomButtons}</div>
            </div>
          </div>

          {/* Row 2: Layout + filter mode + chips */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t('graph.layout')}</span>
              <SegmentedControl value={layoutMode} onChange={setLayoutMode} options={layoutOptions} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t('graph.filter')}</span>
              <SegmentedControl
                value={filterMode}
                onChange={(v) => { setFilterMode(v); setActiveFilters(new Set()) }}
                options={filterModeOptions}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t('graph.colorBy')}</span>
              <SegmentedControl value={colorMode} onChange={setColorMode} options={colorModeOptions} />
            </div>
            {colorMode === 'recency' && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                {RECENCY_STOPS.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {t(s.label)}
                  </span>
                ))}
              </div>
            )}
            {isLarge && layoutMode !== 'random' && (
              <span className="text-xs text-muted-foreground">
                {t('graph.largeGraphHint')}
              </span>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-1.5">
            {filterMode === 'label' ? (
              [...usedLabels].map((key) => {
                const color = getNodeLabelColor(key)
                const active = activeFilters.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleFilter(key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-transparent text-white'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? 'rgba(255,255,255,0.9)' : color }} />
                    {relLabels[key] || key}
                  </button>
                )
              })
            ) : (
              [...usedRelationTypes].sort().map((rt) => {
                const color = getNodeLabelColor(rt)
                const active = activeFilters.has(rt)
                return (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => toggleFilter(rt)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-transparent text-white'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? 'rgba(255,255,255,0.9)' : color }} />
                    {rt}
                  </button>
                )
              })
            )}
            {activeFilters.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilters(new Set())}
                className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t('graph.clearFilter')}
              </button>
            )}
          </div>
        </>
      )}

      <Card className={isFullscreen ? 'h-full rounded-none border-0' : ''}>
        <CardContent className="p-0" ref={setContainerRef}>
          <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">{t('graph.loading')}</div>}>
          <ForceGraph2D<GraphNodeData, { relation_type: string }>
            ref={fgRef}
            graphData={fgData}
            nodeLabel="name"
            nodeColor={(node: GraphNode) => {
              if (node.id === SELF_NODE_ID) return '#10b981'
              return colorMode === 'recency'
                ? getRecencyColor(node.last_interaction_at)
                : getNodeColor(node.relationship_labels)
            }}
            nodeVal={(node: GraphNode) => {
              const count = fgData.linkCounts.get(node.id) || 0
              return node.id === SELF_NODE_ID ? count + 2 : count + 1
            }}
            linkLabel="relation_type"
            linkColor={(link: GraphLink) => {
              if (link.relation_type) return getNodeLabelColor(link.relation_type)
              return dark ? '#374151' : '#d1d5db'
            }}
            linkWidth={(link: GraphLink) => link.relation_type ? 1.5 : 0.5}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkLineDash={(link: GraphLink) => link.relation_type ? null : [4, 4]}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
              const x = node.x
              const y = node.y
              if (x == null || y == null) return
              const r = nodeRadius
              ctx.beginPath()
              ctx.arc(x, y, r + 4, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={dark ? '#111827' : 'transparent'}
            cooldownTicks={cooldownTicks}
            onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
          />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
