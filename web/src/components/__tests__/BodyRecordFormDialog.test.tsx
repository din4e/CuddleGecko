import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BodyRecordFormDialog } from '../BodyRecordFormDialog'
import type { BodyMetric } from '../../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'zh' } }),
}))

vi.mock('../../hooks/api/useBodyMetrics', () => ({
  useCreateBodyMetric: vi.fn(),
  useUpdateBodyMetric: vi.fn(),
}))

import { useCreateBodyMetric, useUpdateBodyMetric } from '../../hooks/api/useBodyMetrics'

const yesterday: BodyMetric = {
  id: 1, user_id: 1, workspace_id: 1,
  recorded_at: '2026-09-10T09:00:00+08:00',
  weight: 70.9, height: 175, body_fat: 18.5, muscle_mass: 32,
  resting_hr: 52, systolic: 115, diastolic: 75,
  sleep_hours: 8.2, bedtime: '2026-09-09T23:10:00+08:00', wake_time: '2026-09-10T07:20:00+08:00',
  sleep_score: 9, steps: 8500, energy: 8, mood: 9,
  notes: '昨晚睡得很好', created_at: '', updated_at: '',
}

describe('BodyRecordFormDialog copy previous day', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCreateBodyMetric).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useUpdateBodyMetric).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  })

  it('prefills all measured values from the previous record on one click', async () => {
    const user = userEvent.setup()
    render(<BodyRecordFormDialog open editing={null} copyFrom={yesterday} onClose={vi.fn()} />)
    await user.click(screen.getByText('fitness.copyPrevDay'))

    const inputByLabel = (label: string) =>
      screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement
    expect(inputByLabel('fitness.weight').value).toBe('70.9')
    expect(inputByLabel('fitness.restingHr').value).toBe('52')
    expect(inputByLabel('fitness.sleepHours').value).toBe('8.2')
    expect(inputByLabel('fitness.steps').value).toBe('8500')
    // star ratings: sleep 9/10, energy 8/10, mood 9/10 (radiogroups in form order)
    const picked = screen.getAllByRole('radiogroup').map((g) => {
      const checked = g.querySelector('[role="radio"][aria-checked="true"]')
      return checked?.getAttribute('aria-label')
    })
    expect(picked).toEqual(['9/10', '8/10', '9/10'])
    // notes are personal text and stay empty
    const notes = screen.getByText('fitness.notes').parentElement!.querySelector('textarea') as HTMLTextAreaElement
    expect(notes.value).toBe('')
  })

  it('hides the copy button when editing an existing record or no source', () => {
    const { rerender } = render(<BodyRecordFormDialog open editing={yesterday} copyFrom={yesterday} onClose={vi.fn()} />)
    expect(screen.queryByText('fitness.copyPrevDay')).toBeNull()
    rerender(<BodyRecordFormDialog open editing={null} copyFrom={null} onClose={vi.fn()} />)
    expect(screen.queryByText('fitness.copyPrevDay')).toBeNull()
  })

  it('saves the copied values as a new record', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockResolvedValue({})
    vi.mocked(useCreateBodyMetric).mockReturnValue({ mutateAsync: create, isPending: false } as never)
    const onClose = vi.fn()
    render(<BodyRecordFormDialog open editing={null} copyFrom={yesterday} onClose={onClose} />)
    await user.click(screen.getByText('fitness.copyPrevDay'))
    await user.click(screen.getByText('common.create'))
    expect(create).toHaveBeenCalledTimes(1)
    const payload = create.mock.calls[0][0]
    expect(payload.weight).toBe(70.9)
    expect(payload.sleep_score).toBe(9)
    expect(payload.energy).toBe(8)
    expect(payload.notes).toBe('')
  })
})
