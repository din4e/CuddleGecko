import { describe, it, expect } from 'vitest'
import { buildICS } from '../ics'
import type { Todo } from '../../types'

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 1, user_id: 1, workspace_id: 1, title: 'Buy milk', description: '',
    status: 'pending', priority: 'normal', due_time: null, amount: null,
    amount_type: '', contact_ids: [], color: '', completed_at: null,
    created_at: '', updated_at: '', ...over,
  }
}

describe('buildICS', () => {
  it('wraps due todos in a VCALENDAR and skips todos without a due time', () => {
    const ics = buildICS([
      todo({ id: 1, title: 'Task A', due_time: '2026-05-01T09:00:00Z' }),
      todo({ id: 2, title: 'No due', due_time: null }),
    ])
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Task A')
    expect(ics).toContain('DUE:20260501T090000Z')
    expect(ics).toContain('UID:todo-1@cuddlegecko')
    expect(ics).not.toContain('No due')
  })

  it('marks done todos as COMPLETED and pending as NEEDS-ACTION', () => {
    const done = buildICS([todo({ status: 'done', due_time: '2026-05-01T09:00:00Z' })])
    expect(done).toContain('STATUS:COMPLETED')
    const pending = buildICS([todo({ status: 'pending', due_time: '2026-05-01T09:00:00Z' })])
    expect(pending).toContain('STATUS:NEEDS-ACTION')
  })

  it('includes and escapes the description', () => {
    const ics = buildICS([todo({ description: 'a, b; c\nnewline', due_time: '2026-05-01T09:00:00Z' })])
    expect(ics).toContain('DESCRIPTION:a\\, b\\; c\\nnewline')
  })

  it('produces no VEVENTs when no todos have due times', () => {
    const ics = buildICS([todo({ due_time: null })])
    expect(ics).not.toContain('VEVENT')
  })

  // RFC 5545 §3.1: lines >75 octets must fold with CRLF + space — unfolded long
  // lines make Outlook drop the whole event.
  it('folds long SUMMARY lines and stays lossless', () => {
    const ics = buildICS([todo({ id: 5, title: 'A'.repeat(200), due_time: '2026-05-01T09:00:00Z' })])
    const lines = ics.split('\r\n')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(75)
    // The SUMMARY's continuation lines start with a space…
    const summaryIdx = lines.findIndex((l) => l.startsWith('SUMMARY:AAAA'))
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(lines[summaryIdx + 1].startsWith(' ')).toBe(true)
    // …and unfolding (strip CRLF+space) restores the full 200-char title.
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain(`SUMMARY:${'A'.repeat(200)}`)
  })

  // DTSTAMP must be the generation time, not the event's future due time.
  it('uses generation time for DTSTAMP, keeping DTSTART at the due time', () => {
    const ics = buildICS([todo({ id: 9, due_time: '2030-01-01T09:00:00Z' })])
    const stamp = ics.match(/DTSTAMP:(\d{8}T\d{6})Z/)?.[1]
    expect(stamp).toBeTruthy()
    expect(stamp?.startsWith('2026')).toBe(true) // ~now, not 2030
    expect(ics).toContain('DTSTART:20300101T090000Z')
  })
})
