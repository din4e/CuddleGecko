const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

// Strip ANSI CSI escapes and normalize control chars from user-controlled
// values before they're written to xterm. Without this, a todo titled
// "\x1b[2J" wipes the screen and a title embedding "\r\ngecko> " renders a
// fake prompt — a convincing phishing vector in shared workspaces. The
// formatters' OWN color codes are applied around sanitized values, so intended
// styling is unaffected.
function sanitize(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex -- stripping control chars is the entire point of this function
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') // CSI sequences (colors, cursor moves, screen clears)
    // eslint-disable-next-line no-control-regex -- see above
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '') // OSC sequences (title set, hyperlinks)
    // eslint-disable-next-line no-control-regex -- see above
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // other C0/C1 control chars (keep \t \n \r)
}

export function formatTable(data: Record<string, unknown>[], columns?: string[]): string {
  if (data.length === 0) return `${YELLOW}No results found${RESET}`

  const cols = columns || Object.keys(data[0])
  const widths = cols.map((col) => {
    const headerLen = col.length
    const maxDataLen = Math.max(...data.map((row) => String(row[col] ?? '').length))
    return Math.min(Math.max(headerLen, maxDataLen) + 2, 40)
  })

  const header = cols
    .map((col, i) => {
      const label = col.length > widths[i] - 2 ? col.slice(0, widths[i] - 2) : col
      return `${BOLD}${label.padEnd(widths[i])}${RESET}`
    })
    .join('')

  const separator = cols.map((_, i) => DIM + '─'.repeat(widths[i]) + RESET).join('')

  const rows = data.map((row) =>
    cols
      .map((col, i) => {
        const val = sanitize(String(row[col] ?? ''))
        const truncated = val.length > widths[i] - 2 ? val.slice(0, widths[i] - 3) + '...' : val
        return truncated.padEnd(widths[i])
      })
      .join(''),
  )

  return [header, separator, ...rows].join('\r\n')
}

export function formatDetail(data: Record<string, unknown>): string {
  const entries = Object.entries(data)
  const maxKeyLen = Math.max(...entries.map(([k]) => sanitize(k).length))
  return entries
    .map(([key, val]) => {
      const display = Array.isArray(val)
        ? val.length > 0 ? val.map((v) => sanitize(String(v))).join(', ') : DIM + '(none)' + RESET
        : val === null || val === undefined || val === ''
          ? DIM + '(empty)' + RESET
          : sanitize(String(val))
      return `${CYAN}${BOLD}${sanitize(key).padEnd(maxKeyLen + 1)}${RESET} ${display}`
    })
    .join('\r\n')
}

export function formatJSON(data: unknown): string {
  try {
    // Recursively sanitize before serializing — escapes inside string values
    // and object keys would otherwise reach xterm verbatim.
    const clean = JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'string' ? sanitize(v) : v)))
    return JSON.stringify(clean, null, 2)
  } catch {
    return sanitize(String(data))
  }
}

export function formatError(message: string): string {
  return `${RED}${message}${RESET}`
}

export function formatSuccess(message: string): string {
  return `${GREEN}${message}${RESET}`
}

export function formatCount(data: unknown[]): string {
  return `${CYAN}${data.length}${RESET} item(s)`
}
