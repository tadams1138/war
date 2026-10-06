// Cursor-paged Staff Voter list (the spec, §6.7): the first page loads on
// mount and again whenever the status filter or (debounced) search text
// changes; `loadMore` appends the page after `nextCursor`.
import { useEffect, useState } from 'react'
import { getAdminVoters, type AdminVoterItem, type GetAdminVotersParams } from '../../api/client'
import { toUserMessage } from '../../api/errors'

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
  const [status, setStatus] = useState<UseAdminVotersResult['status']>('loading')
  const [voters, setVoters] = useState<AdminVoterItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<AdminVoterStatusFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let cancelled = false
    getAdminVoters(buildParams(statusFilter, debouncedSearch))
      .then((page) => {
        if (cancelled) return
        setVoters(page.voters)
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
    getAdminVoters(buildParams(statusFilter, debouncedSearch, nextCursor))
      .then((page) => {
        setVoters((current) => [...current, ...page.voters])
        setNextCursor(page.next_cursor)
      })
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setLoadingMore(false))
  }

  return {
    status,
    voters,
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
