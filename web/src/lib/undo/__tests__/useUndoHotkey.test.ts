import { describe, it, expect } from 'vitest'
import { isEditableTarget } from '../useUndoHotkey'

function el(props: Record<string, unknown>): EventTarget | null {
  return props as unknown as EventTarget
}

describe('isEditableTarget', () => {
  it('treats text-entry elements as native-undo territory', () => {
    expect(isEditableTarget(el({ tagName: 'INPUT' }))).toBe(true)
    expect(isEditableTarget(el({ tagName: 'input' }))).toBe(true)
    expect(isEditableTarget(el({ tagName: 'TEXTAREA' }))).toBe(true)
    expect(isEditableTarget(el({ tagName: 'DIV', isContentEditable: true }))).toBe(true)
  })

  it('lets global undo through on plain surfaces', () => {
    expect(isEditableTarget(el({ tagName: 'DIV' }))).toBe(false)
    expect(isEditableTarget(el({ tagName: 'BUTTON' }))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false)
  })
})
