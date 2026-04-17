import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { graphApi } from '../api/graph'
import type { GraphData } from '../types'
import { Card, CardContent } from '../components/ui/card'

const relationshipColors: Record<string, string> = {
  family: '#ec4899',
  friend: '#22c55e',
  colleague: '#3b82f6',
  client: '#a855f7',
  other: '#6b7280',
}

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const fgRef = useRef<any>(null)

  useEffect(() => {
    graphApi.get()
      .then((res) => {
        const data = res.data
        setGraphData(data)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleNodeClick = useCallback((node: any) => {
    navigate(`/contacts/${node.id}`)
  }, [navigate])

  if (loading) return <div>Loading graph...</div>
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Network Graph</h1>
        <p className="text-center text-muted-foreground py-12">Add contacts and relations to see your network graph.</p>
      </div>
    )
  }

  const fgData = {
    nodes: graphData.nodes.map((n) => ({ ...n, id: n.id })),
    links: graphData.edges.map((e) => ({ source: e.source, target: e.target, relation_type: e.relation_type })),
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Network Graph</h1>
      <Card>
        <CardContent className="p-0">
          <ForceGraph2D
            ref={fgRef}
            graphData={fgData}
            nodeLabel="name"
            nodeColor={(node: any) => relationshipColors[node.relationship_type] || '#6b7280'}
            nodeVal={(node: any) => {
              const links = fgData.links.filter((l: any) => l.source.id === node.id || l.target.id === node.id)
              return links.length + 1
            }}
            linkLabel="relation_type"
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.name
              const fontSize = 12 / globalScale
              ctx.font = `${fontSize}px Sans-Serif`
              const textWidth = ctx.measureText(label).width
              const bckgDimensions = [textWidth, fontSize].map((s) => s + fontSize * 0.4)
              const r = Math.max(...bckgDimensions) / 2

              ctx.fillStyle = relationshipColors[node.relationship_type] || '#6b7280'
              ctx.globalAlpha = 0.1
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
              ctx.fill()
              ctx.globalAlpha = 1

              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillStyle = '#333'
              ctx.fillText(label, node.x!, node.y!)
            }}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const fontSize = 12
              ctx.font = `${fontSize}px Sans-Serif`
              const textWidth = ctx.measureText(node.name).width
              const bckgDimensions = [textWidth, fontSize].map((s) => s + fontSize * 0.4)
              const r = Math.max(...bckgDimensions) / 2
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
              ctx.fill()
            }}
            width={800}
            height={600}
            cooldownTicks={100}
            onEngineStop={() => fgRef.current?.zoomToFit(400)}
          />
        </CardContent>
      </Card>
      <div className="flex gap-4 text-sm text-muted-foreground">
        {Object.entries(relationshipColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </div>
        ))}
      </div>
    </div>
  )
}
