// Cursor-paged Staff War list (the spec, §6.7): the first page loads on mount
// and again whenever the status filter or (debounced) search text changes;
// `loadMore` appends the page after `nextCursor`.
import { useEffect, useState } from 'react'
import { getAdminWars, type AdminWarItem, type GetAdminWarsParams } from '../../api/client'
import { toUserMessage } from '../../api/errors'

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
  const [status, setStatus] = useState<UseAdminWarsResult['status']>('loading')
  const [wars, setWars] = useState<AdminWarItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<AdminWarStatusFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Only the settled value ever triggers a fetch -- typing shouldn't fire a
  // request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let cancelled = false
    getAdminWars(buildParams(statusFilter, debouncedSearch))
      .then((page) => {
        if (cancelled) return
        setWars(page.wars)
        setNextCursor(page.next_cursor)
        setError(null)
        setStatus('loaded')
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        setError(toUserMessage(failure))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [statusFilter, debouncedSearch])

  function loadMore() {
    if (nextCursor === null) return
    setLoadingMore(true)
    getAdminWars(buildParams(statusFilter, debouncedSearch, nextCursor))
      .then((page) => {
        setWars((current) => [...current, ...page.wars])
        setNextCursor(page.next_cursor)
      })
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setLoadingMore(false))
  }

  return {
    status,
    wars,
    error,
    statusFilter,
    setStatusFilter,
    searchText,
    setSearchText,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMore,
  }
}
