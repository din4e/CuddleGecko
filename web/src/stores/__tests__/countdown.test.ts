import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { useCountdownStore } from '../countdown'

const NOW = new Date('2026-09-25T12:00:00Z')

describe('countdown store', () => {
  beforeEach(() => {
    localStorageShim.clear()
    useCountdownStore.setState({ items: [], barHidden: false })
  })

  it('adds an item with alert flags disarmed', () => {
    useCountdownStore.getState().add({ label: '泡面', target: NOW.toISOString(), remindBeforeMin: 5 })
    const items = useCountdownStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ label: '泡面', remindBeforeMin: 5, preFired: false, fired: false })
    expect(items[0].id).toBeTruthy()
  })

  it('marks each alert kind independently', () => {
    useCountdownStore.getState().add({ label: 'a', target: NOW.toISOString() })
    const id = useCountdownStore.getState().items[0].id
    useCountdownStore.getState().markAlerted(id, 'pre')
    expect(useCountdownStore.getState().items[0].preFired).toBe(true)
    expect(useCountdownStore.getState().items[0].fired).toBe(false)
    useCountdownStore.getState().markAlerted(id, 'final')
    expect(useCountdownStore.getState().items[0].fired).toBe(true)
  })

  it('re-arms alerts when the target changes, but not on a label edit', () => {
    useCountdownStore.getState().add({ label: 'a', target: NOW.toISOString(), remindBeforeMin: 5 })
    const id = useCountdownStore.getState().items[0].id
    useCountdownStore.getState().markAlerted(id, 'pre')
    useCountdownStore.getState().markAlerted(id, 'final')

    useCountdownStore.getState().update(id, { label: 'renamed' })
    expect(useCountdownStore.getState().items[0]).toMatchObject({ label: 'renamed', preFired: true, fired: true })

    useCountdownStore.getState().update(id, {
      target: new Date(NOW.getTime() + 60_000).toISOString(),
    })
    expect(useCountdownStore.getState().items[0]).toMatchObject({ preFired: false, fired: false })

    useCountdownStore.getState().markAlerted(id, 'pre')
    useCountdownStore.getState().update(id, { remindBeforeMin: 10 })
    expect(useCountdownStore.getState().items[0]).toMatchObject({ preFired: false, fired: false })
  })

  it('clearFinished drops only past targets', () => {
    const past = new Date(NOW.getTime() - 1_000).toISOString()
    const future = new Date(NOW.getTime() + 60_000).toISOString()
    const { add, clearFinished } = useCountdownStore.getState()
    add({ label: 'past', target: past })
    add({ label: 'future', target: future })
    clearFinished(NOW)
    expect(useCountdownStore.getState().items.map((it) => it.label)).toEqual(['future'])
  })

  it('removes by id and toggles the bar', () => {
    useCountdownStore.getState().add({ label: 'a', target: NOW.toISOString() })
    const id = useCountdownStore.getState().items[0].id
    useCountdownStore.getState().remove(id)
    expect(useCountdownStore.getState().items).toHaveLength(0)

    useCountdownStore.getState().setBarHidden(true)
    expect(useCountdownStore.getState().barHidden).toBe(true)
  })
})
