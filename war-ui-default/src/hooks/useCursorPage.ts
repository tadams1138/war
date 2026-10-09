// A cursor-paged list: the first page loads on mount and again whenever
// `deps` (primitives only) change; `loadMore` appends the page after
// `nextCursor`.
import { useEffect, useState } from 'react'
import { toUserMessage } from '../api/errors'
import type { ResourceDeps } from './useAsyncResource'
import { useLatest } from './useLatest'

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface UseCursorPageResult<T> {
  status: 'loading' | 'loaded' | 'error'
  items: T[]
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}

export function useCursorPage<T>(fetchPage: (cursor?: string) => Promise<CursorPage<T>>, deps: ResourceDeps): UseCursorPageResult<T> {
  const [status, setStatus] = useState<UseCursorPageResult<T>['status']>('loading')
  const [items, setItems] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestFetch = useLatest(fetchPage)
  const depsKey = JSON.stringify(deps)

  useEffect(() => {
    let cancelled = false
    latestFetch
      .current()
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setNextCursor(page.nextCursor)
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
  }, [depsKey, latestFetch])

  function loadMore() {
    if (nextCursor === null) return
    setLoadingMore(true)
    latestFetch
      .current(nextCursor)
      .then((page) => {
        setItems((current) => [...current, ...page.items])
        setNextCursor(page.nextCursor)
      })
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setLoadingMore(false))
  }

  return { status, items, error, hasMore: nextCursor !== null, loadingMore, loadMore }
}
