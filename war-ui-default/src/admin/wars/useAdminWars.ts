// Cursor-paged Staff War list (war-spec.md §6.7), refetched from the first
// page whenever the status filter or (debounced) search text changes.
import { useState } from 'react'
import { getAdminWars, type AdminWarItem, type GetAdminWarsParams } from '../../api/client'
import { useCursorPage } from '../../hooks/useCursorPage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

export type AdminWarStatusFilter = NonNullable<GetAdminWarsParams['status']> | 'all'

export interface UseAdminWarsResult {
  status: 'loading' | 'loaded' | 'error'
  wars: AdminWarItem[]
  error: string | null
  statusFilter: AdminWarStatusFilter
  setStatusFilter: (filter: AdminWarStatusFilter) => void
  searchText: string
  setSearchText: (text: string) => void
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}

const SEARCH_DEBOUNCE_MS = 300

function buildParams(statusFilter: AdminWarStatusFilter, q: string, cursor?: string): GetAdminWarsParams {
  const params: GetAdminWarsParams = {}
  if (statusFilter !== 'all') params.status = statusFilter
  if (q) params.q = q
  if (cursor) params.cursor = cursor
  return params
}

export function useAdminWars(): UseAdminWarsResult {
  const [statusFilter, setStatusFilter] = useState<AdminWarStatusFilter>('all')
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)
  const { items, ...rest } = useCursorPage(
    (cursor) =>
      getAdminWars(buildParams(statusFilter, debouncedSearch, cursor)).then((page) => ({ items: page.wars, nextCursor: page.next_cursor })),
    [statusFilter, debouncedSearch],
  )
  return { ...rest, wars: items, statusFilter, setStatusFilter, searchText, setSearchText }
}
