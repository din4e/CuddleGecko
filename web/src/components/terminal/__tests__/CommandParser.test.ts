import { describe, it, expect } from 'vitest'
import { parseCommand } from '../CommandParser'

// Pipe handling: the pipe operator must only be recognized OUTSIDE quotes —
// a plain indexOf('|') truncated `create buddy --name "A | B"` at the pipe and
// mangled the value.
describe('parseCommand pipe handling', () => {
  it('splits on a pipe outside quotes', () => {
    const parsed = parseCommand('list todos | json')
    expect(parsed).not.toBeNull()
    expect(parsed?.pipe).toBe('json')
  })

  it('ignores pipes inside double quotes', () => {
    const parsed = parseCommand('create buddy --name "A | B"')
    expect(parsed).not.toBeNull()
    expect(parsed?.pipe).toBeUndefined()
    // The quoted value survives intact for the arg parser.
    expect(parsed?.raw).toContain('"A | B"')
  })

  it('ignores pipes inside single quotes', () => {
    const parsed = parseCommand("create tag --name 'x | y'")
    expect(parsed).not.toBeNull()
    expect(parsed?.pipe).toBeUndefined()
  })

  it('still pipes when a quoted arg precedes the pipe', () => {
    const parsed = parseCommand('create buddy --name "A | B" | count')
    expect(parsed).not.toBeNull()
    expect(parsed?.pipe).toBe('count')
    expect(parsed?.raw).toContain('"A | B"')
  })

  it('returns null for empty input', () => {
    expect(parseCommand('')).toBeNull()
    expect(parseCommand('   ')).toBeNull()
  })
})
