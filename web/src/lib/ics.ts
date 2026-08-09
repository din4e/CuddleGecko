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

// Escape special characters per RFC 5544 TEXT type.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function buildICS(todos: Todo[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CuddleGecko//Todo//EN']
  for (const t of todos) {
    if (!t.due_time) continue
    const due = icsDate(t.due_time)
    lines.push(
      'BEGIN:VEVENT',
      `UID:todo-${t.id}@cuddlegecko`,
      `DTSTAMP:${due}`,
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
  return lines.join('\r\n')
}
