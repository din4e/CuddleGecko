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
})
