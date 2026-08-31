import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

vi.mock('../../api/settings', () => ({
  settingsApi: {
    getGraph: vi.fn(),
    updateGraph: vi.fn(),
  },
}))

import { useGraphSettings, GRAPH_SETTINGS_DEFAULTS } from '../graphSettings'
import { settingsApi } from '../../api/settings'

const mockedGetGraph = vi.mocked(settingsApi.getGraph)
const mockedUpdateGraph = vi.mocked(settingsApi.updateGraph)

describe('graphSettings store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorageShim.clear()
    mockedGetGraph.mockResolvedValue({ ...GRAPH_SETTINGS_DEFAULTS })
    mockedUpdateGraph.mockResolvedValue({ ...GRAPH_SETTINGS_DEFAULTS })
    useGraphSettings.setState({ ...GRAPH_SETTINGS_DEFAULTS, loaded: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes the documented defaults', () => {
    const s = useGraphSettings.getState()
    expect(s.nodeRadius).toBe(18)
    expect(s.emojiSize).toBe(28)
    expect(s.showLabels).toBe(true)
    expect(s.showSelf).toBe(true)
    expect(s.layoutMode).toBe('force')
    expect(s.linkDistance).toBe(30)
    expect(s.chargeStrength).toBe(30)
    expect(s.loaded).toBe(false)
  })

  it('setters update individual settings', () => {
    const s = useGraphSettings.getState()
    s.setNodeRadius(40)
    s.setEmojiSize(48)
    s.setShowLabels(false)
    s.setShowSelf(false)
    s.setLayoutMode('cluster')
    s.setLinkDistance(120)
    s.setChargeStrength(80)
    expect(useGraphSettings.getState()).toMatchObject({
      nodeRadius: 40,
      emojiSize: 48,
      showLabels: false,
      showSelf: false,
      layoutMode: 'cluster',
      linkDistance: 120,
      chargeStrength: 80,
    })
  })

  it('reset restores every setting to its default', () => {
    const s = useGraphSettings.getState()
    s.setNodeRadius(40)
    s.setEmojiSize(48)
    s.setShowLabels(false)
    s.setShowSelf(false)
    s.setLayoutMode('random')
    s.setLinkDistance(120)
    s.setChargeStrength(80)
    useGraphSettings.getState().reset()
    expect(useGraphSettings.getState()).toMatchObject(GRAPH_SETTINGS_DEFAULTS)
  })

  it('pushes one debounced update to the server after changes', async () => {
    const s = useGraphSettings.getState()
    s.setNodeRadius(25)
    s.setNodeRadius(30)
    s.setShowLabels(false)
    expect(mockedUpdateGraph).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(600)
    expect(mockedUpdateGraph).toHaveBeenCalledTimes(1)
    expect(mockedUpdateGraph).toHaveBeenCalledWith({ ...GRAPH_SETTINGS_DEFAULTS, nodeRadius: 30, showLabels: false })
  })

  it('load() applies the server config and marks loaded', async () => {
    mockedGetGraph.mockResolvedValue({ ...GRAPH_SETTINGS_DEFAULTS, nodeRadius: 33, layoutMode: 'cluster' })
    await useGraphSettings.getState().load()
    const s = useGraphSettings.getState()
    expect(s.nodeRadius).toBe(33)
    expect(s.layoutMode).toBe('cluster')
    expect(s.loaded).toBe(true)
  })

  it('load() keeps local state when a save is still pending', async () => {
    useGraphSettings.getState().setNodeRadius(42)
    mockedGetGraph.mockResolvedValue({ ...GRAPH_SETTINGS_DEFAULTS, nodeRadius: 10 })
    await useGraphSettings.getState().load()

    expect(useGraphSettings.getState().nodeRadius).toBe(42)
    expect(useGraphSettings.getState().loaded).toBe(false)

    // The pending push still goes out with the local value.
    await vi.advanceTimersByTimeAsync(600)
    expect(mockedUpdateGraph).toHaveBeenCalledWith(expect.objectContaining({ nodeRadius: 42 }))
  })

  it('load() survives a server error', async () => {
    mockedGetGraph.mockRejectedValue(new Error('offline'))
    await useGraphSettings.getState().load()
    expect(useGraphSettings.getState().loaded).toBe(true)
    expect(useGraphSettings.getState().nodeRadius).toBe(18)
  })
})
