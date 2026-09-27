// The shared paged/sorted/searched War list Home and MyWars both drive
// their controls from. Never fetches more than one page at a time (the
// spec's "server-side, not client-side" requirement) -- the only thing
// kept client-side is a cache of pages already turned to *this session*,
// purely so Prev doesn't need a network round-trip.
import { useEffect, useRef, useState } from 'react'
import { getWars, type GetWarsParams, type WarSummary } from '../api/client'
import { toUserMessage } from '../api/errors'

export type WarListSort = 'newest' | 'oldest' | 'expiring_soonest' | 'alphabetical'

export type WarListPageState =
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
// Backlog item 2 (PROGRESS.md): 10 cards per page.
const PAGE_SIZE = '10'

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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [pages, setPages] = useState<CachedPage[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [state, setState] = useState<WarListPageState>({ status: 'loading' })
  // Guards against a fetch that resolves after a newer one has already
  // been issued (a sort/search change, or Next, racing a slower in-flight
  // request) — the same staleness protection useAsyncResource's
  // `cancelled` flag gives a single fetch-on-mount, generalized to cover
  // every fetch this hook can issue, not just the initial one.
  const requestSeq = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Only the settled value below ever triggers a fetch -- typing shouldn't
  // fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchText])

  // A sort or (debounced) search change is a new query, not a
  // continuation: drop the cache and fetch page 1 fresh.
  useEffect(() => {
    setPages([])
    setPageIndex(0)
    void fetchPage(buildParams(sort, debouncedSearch, creatorMe), 'reset')
  }, [sort, debouncedSearch, creatorMe])

  function commitSuccess(seq: number, page: CachedPage, mode: 'reset' | 'append'): void {
    if (!mounted.current || requestSeq.current !== seq) return
    setState({ status: 'loaded', wars: page.wars })
    if (mode === 'reset') {
      setPages([page])
      setPageIndex(0)
    } else {
      setPages((previous) => [...previous, page])
      setPageIndex((index) => index + 1)
    }
  }

  function commitFailure(seq: number, error: unknown): void {
    if (!mounted.current || requestSeq.current !== seq) return
    setState({ status: 'error', message: toUserMessage(error) })
  }

  async function fetchPage(params: GetWarsParams, mode: 'reset' | 'append'): Promise<void> {
    requestSeq.current += 1
    const seq = requestSeq.current
    setState({ status: 'loading' })
    try {
      const response = await getWars(params)
      commitSuccess(seq, { wars: response.wars, nextCursor: response.next_cursor }, mode)
    } catch (error) {
      commitFailure(seq, error)
    }
  }

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
