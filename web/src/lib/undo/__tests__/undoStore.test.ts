import { describe, it, expect, beforeEach } from 'vitest'
import { useUndoStore } from '../undoStore'

const baseEntry = (mergeKey: string, marker: string) => ({
  label: { action: 'update', entity: 'todos' },
  mergeKey,
  ops: [async () => marker],
  scopes: ['todos'],
})

describe('useUndoStore', () => {
  beforeEach(() => {
    useUndoStore.getState().clear()
    useUndoStore.getState().setBusy(false)
  })

  it('pushes and pops in LIFO order', async () => {
    useUndoStore.getState().push(baseEntry('a', 'first'))
    useUndoStore.getState().push(baseEntry('b', 'second'))
    expect(useUndoStore.getState().entries.length).toBe(2)

    const top = useUndoStore.getState().pop()
    expect(top?.mergeKey).toBe('b')
    expect(useUndoStore.getState().entries.length).toBe(1)
    expect(await top?.ops[0]?.([])).toBe('second')
  })

  it('pop on an empty stack is undefined', () => {
    expect(useUndoStore.getState().pop()).toBeUndefined()
  })

  it('merges consecutive same-entity updates, keeping the OLDER ops', async () => {
    useUndoStore.getState().push(baseEntry('update:todos:5', 'save-1'))
    useUndoStore.getState().push(baseEntry('update:todos:5', 'save-2'))
    useUndoStore.getState().push(baseEntry('update:todos:5', 'save-3'))

    // One burst of auto-saves → a single undo back to the pre-burst state.
    expect(useUndoStore.getState().entries.length).toBe(1)
    const entry = useUndoStore.getState().entries[0]
    expect(await entry?.ops[0]?.([])).toBe('save-1')
  })

  it('does not merge updates of different entities', () => {
    useUndoStore.getState().push(baseEntry('update:todos:5', 'a'))
    useUndoStore.getState().push(baseEntry('update:todos:6', 'b'))
    expect(useUndoStore.getState().entries.length).toBe(2)
  })

  it('caps the stack at 50 entries', () => {
    for (let i = 0; i < 60; i++) useUndoStore.getState().push(baseEntry(`key-${i}`, String(i)))
    const entries = useUndoStore.getState().entries
    expect(entries.length).toBe(50)
    expect(entries[0]?.mergeKey).toBe('key-10')
    expect(entries[entries.length - 1]?.mergeKey).toBe('key-59')
  })

  it('clear empties the stack', () => {
    useUndoStore.getState().push(baseEntry('a', 'x'))
    useUndoStore.getState().clear()
    expect(useUndoStore.getState().entries).toEqual([])
  })
})
