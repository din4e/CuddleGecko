import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoHistory } from '../TodoHistory'
import type { TodoActivity } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

const mocks = vi.hoisted(() => ({
  activities: [] as TodoActivity[],
}))

vi.mock('../../hooks/api/useTodos', () => ({
  useTodoActivities: () => ({ data: mocks.activities, isPending: false }),
}))

function activity(over: Partial<TodoActivity> = {}): TodoActivity {
  return {
    id: 1, todo_id: 7, user_id: 2, username: 'bob',
    action: 'completed', field: '', old_value: '', new_value: '',
    created_at: '2026-08-29T10:00:00Z',
    ...over,
  }
}

describe('TodoHistory', () => {
  it('renders the empty state when there is no activity', () => {
    render(<TodoHistory todoId={7} />)
    expect(screen.getByText('todos.historyEmpty')).toBeInTheDocument()
  })

  it('renders simple actions with the actor name', () => {
    mocks.activities = [activity()]
    render(<TodoHistory todoId={7} />)
    expect(screen.getByText('todos.activity.completed')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('renders field updates as old → new with translated status values', () => {
    mocks.activities = [
      activity({ id: 2, action: 'updated', field: 'priority', old_value: 'normal', new_value: 'high' }),
      activity({ id: 3, action: 'updated', field: 'status', old_value: 'pending', new_value: 'done' }),
      activity({ id: 4, action: 'updated', field: 'description', old_value: 'long text', new_value: 'new text' }),
    ]
    render(<TodoHistory todoId={7} />)
    // Priority shows raw values, status shows translated ones, description
    // hides the (potentially huge) bodies behind placeholders. Line text is
    // split across nodes, so assert against the whole body text.
    const text = document.body.textContent ?? ''
    expect(text).toContain('todos.activity.updated todos.activityFields.priority')
    expect(text).toContain('normal → high')
    expect(text).toContain('todos.activityFields.status')
    expect(text).toContain('todos.pending')
    expect(text).toContain('todos.activityPreviousValue')
    expect(text).not.toContain('long text')
  })
})
