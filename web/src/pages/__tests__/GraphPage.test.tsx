import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

// jsdom here has no usable localStorage. zustand persist captures
// window.localStorage when the store module is first imported, so the shim
// must be installed before that import runs — hence vi.hoisted.
const localStorageShim = vi.hoisted(() => {
  const map = new Map<string, string>()
  const shim = {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => void map.clear(),
  }
  vi.stubGlobal('localStorage', shim)
  return shim
})

import GraphPage from '../GraphPage'
import { useGraphSettings, GRAPH_SETTINGS_DEFAULTS } from '../../stores/graphSettings'
import { graphApi } from '../../api/graph'
import type { GraphData } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'graph.title': '关系网络',
        'graph.me': '我',
        'graph.showSelf': '显示自己',
        'graph.hideSelf': '隐藏自己',
        'graph.layout': '布局',
        'graph.filter': '筛选',
        'graph.layoutForce': '力导向',
        'graph.layoutCluster': '按关系聚类',
        'graph.layoutRandom': '随机',
        'graph.displaySettings': '显示设置',
        'graph.zoomIn': '放大',
        'graph.zoomOut': '缩小',
        'graph.fitAll': '适应全部',
        'graph.center': '居中',
        'graph.fullscreen': '全屏',
        'graph.exitFullscreen': '退出全屏',
        'settings.nodeRadius': '节点大小',
        'settings.emojiSize': 'Emoji 大小',
        'settings.showLabels': '显示名称标签',
        'settings.linkDistance': '连线距离',
        'settings.chargeStrength': '节点排斥力',
        'settings.resetDefaults': '恢复默认',
      }
      return translations[key] || key
    },
    i18n: { language: 'zh' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../../api/graph', () => ({
  graphApi: {
    get: vi.fn(),
  },
}))

// The settings store pushes debounced updates to the server on every change;
// mock it so stray debounce timers never reach real axios.
vi.mock('../../api/settings', () => ({
  settingsApi: {
    getGraph: vi.fn().mockResolvedValue({
      nodeRadius: 18,
      emojiSize: 28,
      showLabels: true,
      showSelf: true,
      layoutMode: 'force',
      linkDistance: 30,
      chargeStrength: 30,
    }),
    updateGraph: vi.fn().mockResolvedValue({}),
  },
}))

// Canvas stub: capture props so tests can drive nodeCanvasObject directly.
let lastGraphProps: Record<string, unknown> | null = null
vi.mock('react-force-graph-2d', () => ({
  default: (props: Record<string, unknown>) => {
    lastGraphProps = props
    return <div data-testid="force-graph" />
  },
}))

const mockedGraphGet = vi.mocked(graphApi.get)

const sampleGraph: GraphData = {
  nodes: [
    { id: 1, name: '张三', relationship_labels: ['friend'], avatar_emoji: '', avatar_url: '' },
    { id: 2, name: '李四', relationship_labels: ['family'], avatar_emoji: '', avatar_url: '' },
  ],
  edges: [{ source: 1, target: 2, relation_type: 'friend' }],
}

type NodeCanvasFn = (node: Record<string, unknown>, ctx: CanvasRenderingContext2D, scale: number) => void

function makeCtx() {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
  }
}

function renderPage() {
  return render(
    <BrowserRouter>
      <GraphPage />
    </BrowserRouter>,
  )
}

async function openSettingsPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '显示设置' }))
  return within(screen.getByText('显示设置').parentElement as HTMLElement)
}

describe('GraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageShim.clear()
    useGraphSettings.setState({ ...GRAPH_SETTINGS_DEFAULTS })
    mockedGraphGet.mockResolvedValue({ data: sampleGraph })
  })

  it('renders title, node count and the canvas after data loads', async () => {
    renderPage()
    expect(await screen.findByTestId('force-graph')).toBeInTheDocument()
    expect(screen.getByText('关系网络')).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('paints node name labels when showLabels is on', async () => {
    renderPage()
    await screen.findByTestId('force-graph')
    await waitFor(() => expect(lastGraphProps).not.toBeNull())

    const ctx = makeCtx()
    const nodeCanvasObject = lastGraphProps!.nodeCanvasObject as NodeCanvasFn
    nodeCanvasObject({ id: 1, name: '张三', x: 0, y: 0, relationship_labels: [], avatar_emoji: '' }, ctx as unknown as CanvasRenderingContext2D, 1)
    expect(ctx.fillText).toHaveBeenCalledWith('张三', expect.any(Number), expect.any(Number))
  })

  it('hides name labels when toggled off in the display settings panel', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('force-graph')
    await waitFor(() => expect(lastGraphProps).not.toBeNull())

    const panel = await openSettingsPanel(user)
    await user.click(panel.getByLabelText('显示名称标签'))
    expect(useGraphSettings.getState().showLabels).toBe(false)

    const ctx = makeCtx()
    const nodeCanvasObject = lastGraphProps!.nodeCanvasObject as NodeCanvasFn
    nodeCanvasObject({ id: 1, name: '张三', x: 0, y: 0, relationship_labels: [], avatar_emoji: '😀' }, ctx as unknown as CanvasRenderingContext2D, 1)
    expect(ctx.fillText).not.toHaveBeenCalledWith('张三', expect.any(Number), expect.any(Number))
    expect(ctx.fillText).toHaveBeenCalledWith('😀', expect.any(Number), expect.any(Number))
  })

  it('updates settings live from the panel sliders', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('force-graph')

    await openSettingsPanel(user)
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(4)

    fireEvent.change(sliders[0], { target: { value: '25' } })
    expect(useGraphSettings.getState().nodeRadius).toBe(25)

    fireEvent.change(sliders[2], { target: { value: '80' } })
    expect(useGraphSettings.getState().linkDistance).toBe(80)

    fireEvent.change(sliders[3], { target: { value: '60' } })
    expect(useGraphSettings.getState().chargeStrength).toBe(60)
  })

  it('persists layout and self-visibility choices', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('force-graph')

    await user.click(screen.getByRole('button', { name: '按关系聚类' }))
    expect(useGraphSettings.getState().layoutMode).toBe('cluster')

    await user.click(screen.getByRole('button', { name: '隐藏自己' }))
    expect(useGraphSettings.getState().showSelf).toBe(false)
  })

  it('resets every setting to defaults from the panel', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('force-graph')

    act(() => {
      useGraphSettings.setState({ nodeRadius: 40, layoutMode: 'random', showLabels: false })
    })
    const panel = await openSettingsPanel(user)
    await user.click(panel.getByRole('button', { name: '恢复默认' }))

    expect(useGraphSettings.getState()).toMatchObject(GRAPH_SETTINGS_DEFAULTS)
  })
})
