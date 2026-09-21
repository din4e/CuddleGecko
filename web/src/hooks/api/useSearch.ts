import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '../../api/search'
import { rootKey } from './keys'
import type { SearchResults } from '../../types'

const scope = 'search'

/** Delays propagating a fast-changing value (keystrokes) to avoid firing a
 * query per character. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export interface UseGlobalSearchParams {
  q: string
  /** Restrict search to these entity types (e.g. ['contact', 'todo']). */
  types?: string[]
  /** Per-entity-type hit cap (server clamps to its own max). */
  limit?: number
}

/**
 * Global search across every entity type. Fires only once the (debounced,
 * trimmed) query is non-empty; keeps previous results while the next batch
 * loads so the palette doesn't flash empty between keystrokes.
 */
export function useGlobalSearch({ q, types, limit }: UseGlobalSearchParams) {
  const debounced = useDebouncedValue(q.trim())
  const enabled = debounced.length > 0
  return useQuery<SearchResults>({
    queryKey: [...rootKey(scope), 'q', debounced, ...(types ?? []), limit ?? null] as const,
    queryFn: ({ signal }) =>
      searchApi
        .search(
          {
            q: debounced,
            ...(types && types.length > 0 ? { types: types.join(',') } : {}),
            ...(limit != null ? { limit } : {}),
          },
          signal,
        )
        .then((r) => r.data),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}
