const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

export function formatTable(data: Record<string, any>[], columns?: string[]): string {
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
        const val = String(row[col] ?? '')
        const truncated = val.length > widths[i] - 2 ? val.slice(0, widths[i] - 3) + '...' : val
        return truncated.padEnd(widths[i])
      })
      .join(''),
  )

  return [header, separator, ...rows].join('\r\n')
}

export function formatDetail(data: Record<string, any>): string {
  const entries = Object.entries(data)
  const maxKeyLen = Math.max(...entries.map(([k]) => k.length))
  return entries
    .map(([key, val]) => {
      const display = Array.isArray(val)
        ? val.length > 0 ? val.join(', ') : DIM + '(none)' + RESET
        : val === null || val === undefined || val === ''
          ? DIM + '(empty)' + RESET
          : String(val)
      return `${CYAN}${BOLD}${key.padEnd(maxKeyLen + 1)}${RESET} ${display}`
    })
    .join('\r\n')
}

export function formatJSON(data: any): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

export function formatError(message: string): string {
  return `${RED}${message}${RESET}`
}

export function formatSuccess(message: string): string {
  return `${GREEN}${message}${RESET}`
}

export function formatCount(data: any[]): string {
  return `${CYAN}${data.length}${RESET} item(s)`
}
