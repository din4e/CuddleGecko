import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/settings', () => ({
  settingsApi: {
    getKanban: vi.fn(),
    updateKanban: vi.fn(),
  },
}))

import { settingsApi } from '../../../api/settings'
import { useKanbanColumns } from '../useKanbanColumns'

const savedColumns = [
  { id: 'priority-high', label: 'Urgent', kind: 'priority' as const, value: 'high' },
]

describe('useKanbanColumns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.getKanban).mockResolvedValue({ columns: savedColumns })
  })

  it('loads the saved columns from the API response envelope', async () => {
    const hook = renderHook(() => useKanbanColumns())

    await waitFor(() => expect(hook.result.current.columns).toEqual(savedColumns))
    expect(settingsApi.getKanban).toHaveBeenCalledTimes(1)
  })

  it('defers the request until the kanban view becomes active', async () => {
    const hook = renderHook(({ enabled }) => useKanbanColumns(enabled), { initialProps: { enabled: false } })
    expect(settingsApi.getKanban).not.toHaveBeenCalled()

    await act(async () => { hook.rerender({ enabled: true }) })
    await waitFor(() => expect(settingsApi.getKanban).toHaveBeenCalledTimes(1))
  })
})
