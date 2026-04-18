import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { graphApi } from '../api/graph'
import type { GraphData } from '../types'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { useGraphSettings } from '../stores/graphSettings'
import { ZoomIn, ZoomOut, Maximize, Minimize, RotateCcw, Crosshair } from 'lucide-react'

const ForceGraph2D = lazy(() => import('react-force-graph-2d'))

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

const labelColors: Record<string, string> = {
  family: '#ec4899',
  friend: '#22c55e',
  colleague: '#3b82f6',
  client: '#a855f7',
  pet: '#f59e0b',
  other: '#6b7280',
}

const edgeColorPool = ['#6366f1', '#14b8a6', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#ef4444']

function getLabelColor(label: string): string {
  return labelColors[label] || edgeColorPool[(label.charCodeAt(0) + (label.length > 1 ? label.charCodeAt(1) : 0)) % edgeColorPool.length]
}

function getNodeColor(labels: string[]): string {
  if (labels && labels.length > 0) return getLabelColor(labels[0])
  return '#6b7280'
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

const SELF_NODE_ID = -1

export default function GraphPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'label' | 'relation'>('label')
  const [showSelf, setShowSelf] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
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

  const handleCenter = useCallback(() => {
    const fg = fgRef.current
    if (!fg) return
    const nodes = fg.graphData().nodes as { x: number; y: number }[]
    if (!nodes || nodes.length === 0) return
    let cx = 0, cy = 0
    for (const n of nodes) { cx += n.x; cy += n.y }
    cx /= nodes.length; cy /= nodes.length
    fg.centerAt(cx, cy, 400)
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

  // Responsive canvas sizing
  useEffect(() => {
    const updateSize = () => {
      if (isFullscreen) {
        setDimensions({ width: window.innerWidth, height: window.innerHeight })
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const height = Math.max(400, window.innerHeight - rect.top)
        setDimensions({ width: Math.floor(rect.width), height: Math.floor(height) })
      }
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', updateSize)
    return () => { ro.disconnect(); window.removeEventListener('resize', updateSize) }
  }, [isFullscreen])

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

  const handleNodeClick = useCallback((node: any) => {
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

  // Build filtered data
  const fgData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [], linkCounts: new Map() }

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

    // Add self node — only connect to nodes that have edges (less clutter)
    if (showSelf && nodes.length > 0) {
      nodes.push({ id: SELF_NODE_ID, name: t('graph.me'), relationship_labels: [], avatar_emoji: '', avatar_url: '' })
      nodes.forEach((n) => {
        if (n.id !== SELF_NODE_ID) {
          edges.push({ source: SELF_NODE_ID, target: n.id, relation_type: '' })
        }
      })
    }

    // Precompute link counts per node
    const linkCounts = new Map<number, number>()
    for (const e of edges) {
      linkCounts.set(e.source, (linkCounts.get(e.source) || 0) + 1)
      linkCounts.set(e.target, (linkCounts.get(e.target) || 0) + 1)
    }

    return {
      nodes: nodes.map((n) => ({ ...n, id: n.id })),
      links: edges.map((e) => ({ source: e.source, target: e.target, relation_type: e.relation_type })),
      linkCounts,
    }
  }, [graphData, activeFilters, filterMode, showSelf, t])

  if (loading) return <div>{t('graph.loading')}</div>
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t('graph.title')}</h1>
        <p className="text-center text-muted-foreground py-12">{t('graph.empty')}</p>
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

  const dark = isDarkMode()

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'space-y-4'}>
      {!isFullscreen && (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <h1 className="text-3xl font-bold">{t('graph.title')}</h1>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {fgData.nodes.length - (showSelf ? 1 : 0)} / {graphData.nodes.length} {t('graph.nodes')}
          </div>
          <Badge
            variant={showSelf ? 'default' : 'outline'}
            className="cursor-pointer select-none"
            onClick={() => setShowSelf(!showSelf)}
          >
            {showSelf ? t('graph.hideSelf') : t('graph.showSelf')}
          </Badge>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={handleZoomIn} title={t('graph.zoomIn')}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={handleZoomOut} title={t('graph.zoomOut')}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={handleFitAll} title={t('graph.fitAll')}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={handleCenter} title={t('graph.center')}>
              <Crosshair className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={toggleFullscreen} title={isFullscreen ? t('graph.exitFullscreen') : t('graph.fullscreen')}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Filter mode tabs */}
      <div className="flex items-center gap-2">
        <Badge
          variant={filterMode === 'label' ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => { setFilterMode('label'); setActiveFilters(new Set()) }}
        >
          {t('graph.filterByLabel')}
        </Badge>
        <Badge
          variant={filterMode === 'relation' ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => { setFilterMode('relation'); setActiveFilters(new Set()) }}
        >
          {t('graph.filterByRelation')}
        </Badge>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {filterMode === 'label' ? (
          [...usedLabels].map((key) => (
            <Badge
              key={key}
              variant={activeFilters.has(key) ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              style={activeFilters.has(key) ? { backgroundColor: getLabelColor(key) } : {}}
              onClick={() => toggleFilter(key)}
            >
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getLabelColor(key) }} />
                {relLabels[key] || key}
              </div>
            </Badge>
          ))
        ) : (
          [...usedRelationTypes].sort().map((rt) => (
            <Badge
              key={rt}
              variant={activeFilters.has(rt) ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              style={activeFilters.has(rt) ? { backgroundColor: getLabelColor(rt) } : {}}
              onClick={() => toggleFilter(rt)}
            >
              {rt}
            </Badge>
          ))
        )}
        {activeFilters.size > 0 && (
          <Badge variant="secondary" className="cursor-pointer" onClick={() => setActiveFilters(new Set())}>
            {t('graph.clearFilter')}
          </Badge>
        )}
      </div>
      </>
      )}

      <Card className={isFullscreen ? 'h-full rounded-none border-0' : ''}>
        <CardContent className="p-0" ref={containerRef}>
          <Suspense fallback={<div className="flex items-center justify-center h-[500px]"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
          <ForceGraph2D
            ref={fgRef}
            graphData={fgData}
            nodeLabel="name"
            nodeColor={(node: any) => {
              if (node.id === SELF_NODE_ID) return '#10b981'
              return getNodeColor(node.relationship_labels)
            }}
            nodeVal={(node: any) => {
              const count = fgData.linkCounts.get(node.id) || 0
              return node.id === SELF_NODE_ID ? count + 2 : count + 1
            }}
            linkLabel="relation_type"
            linkColor={(link: any) => {
              if (link.relation_type) return getLabelColor(link.relation_type)
              return dark ? '#374151' : '#d1d5db'
            }}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkLineDash={(link: any) => link.relation_type ? null : [4, 4]}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const isSelf = node.id === SELF_NODE_ID
              const emoji = node.avatar_emoji as string | undefined
              const hasEmoji = emoji && emoji.length > 0

              // Scale sizes inversely with zoom
              const baseRadius = isSelf ? nodeRadius + 4 : nodeRadius
              const r = baseRadius / Math.sqrt(globalScale)
              const fontSize = (isSelf ? 12 : 11) / globalScale
              const emojiSize = (isSelf ? emojiSizeSetting + 4 : emojiSizeSetting) / globalScale

              const color = isSelf ? '#10b981' : getNodeColor(node.relationship_labels)
              const bgColor = dark ? '#1f2937' : '#ffffff'
              const textColor = dark ? '#e5e7eb' : '#1f2937'
              // Glow for self node
              if (isSelf) {
                ctx.shadowColor = '#10b981'
                ctx.shadowBlur = 12 / globalScale
              }

              // Circle background
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
              ctx.fillStyle = bgColor
              ctx.fill()
              ctx.strokeStyle = color
              ctx.lineWidth = 2 / globalScale
              ctx.stroke()

              ctx.shadowColor = 'transparent'
              ctx.shadowBlur = 0

              // Draw avatar content
              const avatarUrl = node.avatar_url as string | undefined
              const avatarImg = avatarUrl ? avatarImageCache.get(avatarUrl) : null
              if (avatarImg) {
                ctx.save()
                ctx.beginPath()
                ctx.arc(node.x!, node.y!, r - 1 / globalScale, 0, 2 * Math.PI)
                ctx.clip()
                ctx.drawImage(avatarImg, node.x! - r, node.y! - r, r * 2, r * 2)
                ctx.restore()
              } else if (hasEmoji) {
                ctx.font = `${emojiSize}px Sans-Serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(emoji, node.x!, node.y!)
              } else {
                // First letter or name initial
                ctx.font = `bold ${r * 1.2}px Sans-Serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = color
                ctx.fillText(node.name?.[0] || '?', node.x!, node.y!)
              }

              // Name label below
              ctx.font = `${fontSize}px Sans-Serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = isSelf ? '#10b981' : textColor
              ctx.fillText(node.name, node.x!, node.y! + r + 2 / globalScale)
            }}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const r = nodeRadius
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r + 4, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={dark ? '#111827' : 'transparent'}
            cooldownTicks={100}
            onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
          />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
