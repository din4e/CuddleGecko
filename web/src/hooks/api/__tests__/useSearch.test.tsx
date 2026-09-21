import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGlobalSearch, useDebouncedValue } from '../useSearch'
import { searchApi } from '../../../api/search'
import type { SearchResults } from '../../../types'

// The search hook must stay dormant until the debounced query is non-empty
// (an empty palette shouldn't hit /api/search), and it must issue ONE request
// per debounced value, not one per keystroke.

vi.mock('../../../api/search', () => ({
  searchApi: { search: vi.fn() },
}))

vi.mock('../keys', () => ({
  rootKey: (scope: string) => [scope, 'default'] as const,
}))

const emptyResults: SearchResults = { query: '', total: 0, hits: [] }

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useGlobalSearch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not fetch for an empty/whitespace query', () => {
    vi.mocked(searchApi.search).mockResolvedValue({ data: emptyResults })
    const { result } = renderHook(
      ({ q }: { q: string }) => useGlobalSearch({ q }),
      { wrapper: createWrapper(), initialProps: { q: '   ' } },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(searchApi.search).not.toHaveBeenCalled()
  })

  it('fetches once per debounced value and joins types into a csv param', async () => {
    vi.mocked(searchApi.search).mockResolvedValue({ data: emptyResults })
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useGlobalSearch({ q, types: ['contact', 'todo'], limit: 5 }),
      { wrapper: createWrapper(), initialProps: { q: '' } },
    )

    // Burst of keystrokes → a single debounced request (250ms debounce,
    // real timers — waitFor below needs them).
    rerender({ q: 'a' })
    rerender({ q: 'ad' })
    rerender({ q: 'ada' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 })
    expect(searchApi.search).toHaveBeenCalledTimes(1)
    expect(searchApi.search).toHaveBeenCalledWith(
      { q: 'ada', types: 'contact,todo', limit: 5 },
      expect.anything(),
    )
  })
})

describe('useDebouncedValue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('propagates the latest value only after the delay', () => {
    vi.useFakeTimers()
    try {
      const { result, rerender } = renderHook(
        ({ v }: { v: string }) => useDebouncedValue(v, 250),
        { initialProps: { v: 'a' } },
      )
      expect(result.current).toBe('a')

      rerender({ v: 'ab' })
      act(() => vi.advanceTimersByTime(100))
      expect(result.current).toBe('a')
      act(() => vi.advanceTimersByTime(200))
      expect(result.current).toBe('ab')
    } finally {
      vi.useRealTimers()
    }
  })
})
