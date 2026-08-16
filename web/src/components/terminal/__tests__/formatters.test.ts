import { describe, it, expect } from 'vitest'
import { formatTable, formatDetail, formatJSON } from '../formatters'

// Escape-sequence injection: user data (todo titles, contact names, …) is
// written into xterm. Unsanitized, a title containing CSI sequences can wipe
// the screen (\x1b[2J), move the cursor, or embed a fake "gecko> " prompt via
// \r\n — a phishing vector in shared workspaces. These lock in the sanitizer.
describe('terminal formatters escape sanitization', () => {
  const hostile = 'evil\x1b[2J\x1b[1;31mtitle'
  const fakePrompt = 'evil\r\ngecko> run dangerous command'

  it('formatTable strips CSI sequences from cell values', () => {
    const out = formatTable([{ title: hostile }])
    expect(out).not.toContain('\x1b[2J')
    expect(out).toContain('evil') // content preserved
    // The only escapes left are the formatter's own styling.
    // eslint-disable-next-line no-control-regex -- asserting on control-char stripping
    const escapes = out.match(/\x1b\[[0-9;?]*[A-Za-z]/g) ?? []
    for (const e of escapes) {
      expect(['\x1b[1m', '\x1b[0m', '\x1b[2m']).toContain(e)
    }
  })

  it('formatTable neutralizes fake-prompt injection (no injected ANSI, content intact)', () => {
    const out = formatTable([{ title: fakePrompt }])
    // The formatter's OWN styling escapes are present — that's intended. What
    // must be gone is the injected payload: no screen-clear, no color codes
    // beyond the formatter's, and the fake prompt text can't drive xterm.
    expect(out).not.toContain('\x1b[2J')
    // eslint-disable-next-line no-control-regex -- asserting on control-char stripping
    const escapes = out.match(/\x1b\[[0-9;?]*[A-Za-z]/g) ?? []
    for (const e of escapes) {
      expect(['\x1b[1m', '\x1b[0m', '\x1b[2m']).toContain(e)
    }
    expect(out).toContain('gecko> run dangerous command') // rendered as plain text, not a real prompt
  })

  it('formatDetail strips escapes from keys and values', () => {
    const out = formatDetail({ [hostile]: hostile, clean: 'ok' })
    expect(out).not.toContain('\x1b[2J')
    expect(out).toContain('evil')
    expect(out).toContain('clean')
    expect(out).toContain('ok')
  })

  it('formatJSON strips escapes from string values deep in the structure', () => {
    const out = formatJSON({ nested: { list: [hostile, fakePrompt] } })
    expect(out).not.toContain('\x1b[')
    expect(out).toContain('evil')
  })

  it('formatJSON passes ordinary data through unchanged', () => {
    const data = { a: 1, b: 'text', c: [true, null] }
    expect(formatJSON(data)).toBe(JSON.stringify(data, null, 2))
  })
})
