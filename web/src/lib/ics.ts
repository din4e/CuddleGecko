import type { Todo } from '../types'

// Build an iCalendar (.ics) feed of todos that have a due time, suitable for
// importing into Google Calendar / Apple Calendar / Outlook.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// RFC 5545 UTC date-time: YYYYMMDDTHHMMSSZ
function icsDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Escape special characters per RFC 5545 TEXT type.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// RFC 5545 §3.1: content lines longer than 75 octets must be folded with
// CRLF + a single linear white space. Unfolded long lines (a 200-char todo
// title easily exceeds it) are rejected or truncated by several parsers —
// Outlook notably drops the whole event.
function fold(line: string): string {
  if (line.length <= 75) return line
  // Split at 74 so the continuation's leading space keeps every emitted line
  // within the 75-octet limit.
  const chunks = line.match(/.{1,74}/g) ?? [line]
  return chunks.join('\r\n ')
}

export function buildICS(todos: Todo[]): string {
  // DTSTAMP is when the iCalendar object was created (per RFC 5545 it must be
  // the generation time — the previous code used the due time, which made
  // every export look minted at the event's future start).
  const stamp = icsDate(new Date().toISOString())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CuddleGecko//Todo//EN']
  for (const t of todos) {
    if (!t.due_time) continue
    const due = icsDate(t.due_time)
    lines.push(
      'BEGIN:VEVENT',
      `UID:todo-${t.id}@cuddlegecko`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${due}`,
      `DUE:${due}`,
      `SUMMARY:${escapeText(t.title)}`,
    )
    if (t.description) {
      lines.push(`DESCRIPTION:${escapeText(t.description)}`)
    }
    lines.push(`STATUS:${t.status === 'done' ? 'COMPLETED' : 'NEEDS-ACTION'}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}
