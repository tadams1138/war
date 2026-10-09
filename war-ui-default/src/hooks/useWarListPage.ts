// The shared paged/sorted/searched War list Home and MyWars both drive
// their controls from. Paging is server-side: only one page is fetched at a
// time, and pages already visited are cached so Prev needs no round-trip.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getWars, type GetWarsParams, type WarSummary } from '../api/client'
import { toUserMessage } from '../api/errors'
import { useDebouncedValue } from './useDebouncedValue'

export type WarListSort = 'newest' | 'oldest' | 'expiring_soonest' | 'alphabetical'

type WarListPageState =
  | { status: 'loading' }
  | { status: 'loaded'; wars: WarSummary[] }
  | { status: 'error'; message: string }

interface CachedPage {
  wars: WarSummary[]
  nextCursor: string | null
}

export interface UseWarListPageOptions {
  // MyWars passes true to scope the list to the signed-in voter's own Wars
  // (creator=me); Home omits it to browse every published public War.
  creatorMe?: boolean
}

export interface UseWarListPageResult {
  state: WarListPageState
  sort: WarListSort
  setSort: (sort: WarListSort) => void
  searchText: string
  setSearchText: (text: string) => void
  hasPrev: boolean
  hasNext: boolean
  goPrev: () => void
  goNext: () => void
}

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 10

function buildParams(sort: WarListSort, q: string, creatorMe: boolean, cursor?: string): GetWarsParams {
  const params: GetWarsParams = { sort, limit: PAGE_SIZE }
  if (q) params.q = q
  if (creatorMe) params.creator = 'me'
  if (cursor) params.cursor = cursor
  return params
}

export function useWarListPage({ creatorMe = false }: UseWarListPageOptions = {}): UseWarListPageResult {
  const [sort, setSort] = useState<WarListSort>('newest')
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)
  const [pages, setPages] = useState<CachedPage[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [state, setState] = useState<WarListPageState>({ status: 'loading' })
  // Drops a response that arrives after a newer request was issued (a
  // sort/search change, or Next, racing a slower in-flight fetch).
  const requestSeq = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const fetchPage = useCallback(async (params: GetWarsParams, mode: 'reset' | 'append'): Promise<void> => {
    requestSeq.current += 1
    const seq = requestSeq.current
    const isCurrent = () => mounted.current && requestSeq.current === seq
    setState({ status: 'loading' })
    try {
      const response = await getWars(params)
      if (!isCurrent()) return
      const page: CachedPage = { wars: response.wars, nextCursor: response.next_cursor }
      setState({ status: 'loaded', wars: page.wars })
      if (mode === 'reset') {
        setPages([page])
        setPageIndex(0)
      } else {
        setPages((previous) => [...previous, page])
        setPageIndex((index) => index + 1)
      }
    } catch (error) {
      if (isCurrent()) setState({ status: 'error', message: toUserMessage(error) })
    }
  }, [])

  // A sort or (debounced) search change is a new query, not a
  // continuation: drop the cache and fetch page 1 fresh.
  useEffect(() => {
    setPages([])
    setPageIndex(0)
    void fetchPage(buildParams(sort, debouncedSearch, creatorMe), 'reset')
  }, [fetchPage, sort, debouncedSearch, creatorMe])

  function goPrev(): void {
    if (pageIndex === 0) return
    const target = pageIndex - 1
    setPageIndex(target)
    setState({ status: 'loaded', wars: pages[target].wars })
  }

  function goNext(): void {
    const current = pages[pageIndex]
    if (!current || current.nextCursor === null) return
    if (pageIndex + 1 < pages.length) {
      const target = pageIndex + 1
      setPageIndex(target)
      setState({ status: 'loaded', wars: pages[target].wars })
      return
    }
    void fetchPage(buildParams(sort, debouncedSearch, creatorMe, current.nextCursor), 'append')
  }

  const currentPage = pages[pageIndex]
  const hasPrev = pageIndex > 0
  const hasNext = currentPage ? currentPage.nextCursor !== null : false

  return { state, sort, setSort, searchText, setSearchText, hasPrev, hasNext, goPrev, goNext }
}
