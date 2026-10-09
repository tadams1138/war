// Cursor-paged Staff Voter list (war-spec.md §6.7), refetched from the first
// page whenever the status filter or (debounced) search text changes.
import { useState } from 'react'
import { getAdminVoters, type AdminVoterItem, type GetAdminVotersParams } from '../../api/client'
import { useCursorPage } from '../../hooks/useCursorPage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

export type AdminVoterStatusFilter = NonNullable<GetAdminVotersParams['status']> | 'all'

export interface UseAdminVotersResult {
  status: 'loading' | 'loaded' | 'error'
  voters: AdminVoterItem[]
  error: string | null
  statusFilter: AdminVoterStatusFilter
  setStatusFilter: (filter: AdminVoterStatusFilter) => void
  searchText: string
  setSearchText: (text: string) => void
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}

const SEARCH_DEBOUNCE_MS = 300

function buildParams(statusFilter: AdminVoterStatusFilter, q: string, cursor?: string): GetAdminVotersParams {
  const params: GetAdminVotersParams = {}
  if (statusFilter !== 'all') params.status = statusFilter
  if (q) params.q = q
  if (cursor) params.cursor = cursor
  return params
}

export function useAdminVoters(): UseAdminVotersResult {
  const [statusFilter, setStatusFilter] = useState<AdminVoterStatusFilter>('all')
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)
  const { items, ...rest } = useCursorPage(
    (cursor) =>
      getAdminVoters(buildParams(statusFilter, debouncedSearch, cursor)).then((page) => ({ items: page.voters, nextCursor: page.next_cursor })),
    [statusFilter, debouncedSearch],
  )
  return { ...rest, voters: items, statusFilter, setStatusFilter, searchText, setSearchText }
}
