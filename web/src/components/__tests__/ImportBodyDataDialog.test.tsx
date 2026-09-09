import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportBodyDataDialog } from '../ImportBodyDataDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, number>) =>
      opts ? `${k}:${JSON.stringify(opts)}` : k,
    i18n: { language: 'zh' },
  }),
}))

vi.mock('../../hooks/api/useBodyMetrics', () => ({
  useImportBodyMetrics: vi.fn(),
}))

import { useImportBodyMetrics } from '../../hooks/api/useBodyMetrics'

const mutateAsync = vi.fn().mockResolvedValue({ data: { created: 3, skipped: 1 } })

describe('ImportBodyDataDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useImportBodyMetrics).mockReturnValue({ mutateAsync, isPending: false } as never)
  })

  it('imports pasted JSON records through the import endpoint', async () => {
    const user = userEvent.setup()
    render(<ImportBodyDataDialog open onClose={vi.fn()} />)
    // fireEvent.change instead of userEvent.type: the JSON braces are parsed
    // as key descriptors by user-event's keyboard parser.
    fireEvent.change(screen.getByLabelText('JSON'), {
      target: { value: '{"records":[{"date":"2026-09-08","bedtime":"2026-09-07T23:10:00+08:00","wake_time":"2026-09-08T07:20:00+08:00","score_100":86}]}' },
    })
    await user.click(screen.getByText('fitness.importDataSubmit'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      source: 'garmin',
      records: [{ date: '2026-09-08', bedtime: '2026-09-07T23:10:00+08:00', wake_time: '2026-09-08T07:20:00+08:00', score_100: 86 }],
    })
    // success line reports created/skipped counts
    expect(await screen.findByText(/"created":3/)).toBeInTheDocument()
  })

  it('accepts a bare array as well as {records: [...]}', async () => {
    const user = userEvent.setup()
    render(<ImportBodyDataDialog open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '[{"date":"2026-09-08"}]' } })
    await user.click(screen.getByText('fitness.importDataSubmit'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ source: 'garmin', records: [{ date: '2026-09-08' }] }))
  })

  it('rejects invalid JSON without calling the API', async () => {
    const user = userEvent.setup()
    render(<ImportBodyDataDialog open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: 'not json' } })
    await user.click(screen.getByText('fitness.importDataSubmit'))
    expect(await screen.findByText('fitness.importDataInvalid')).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
