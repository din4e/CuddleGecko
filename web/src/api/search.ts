import { request } from './client'
import type { SearchResults } from '../types'

export const searchApi = {
  // Global search across every entity type (empty types = all). `limit` caps
  // hits per entity type, not in total.
  search: (
    params: { q: string; types?: string; limit?: number },
    signal?: AbortSignal,
  ) => request.get<SearchResults>('/search', { params, signal }).then((data) => ({ data })),
}
