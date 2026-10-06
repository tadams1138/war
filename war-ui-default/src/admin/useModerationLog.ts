// Cursor-paged moderation log, newest first (the spec, §6.7): the first page
// loads on mount, `loadMore` appends the page after `nextCursor`.
import { useEffect, useState } from 'react'
import { getModerationLog, type ModerationLogEntry } from '../api/client'
import { toUserMessage } from '../api/errors'

export interface UseModerationLogResult {
  status: 'loading' | 'loaded' | 'error'
  entries: ModerationLogEntry[]
  hasMore: boolean
  loadingMore: boolean
  error: string | null
  loadMore: () => void
}

// `refreshToken` changing refetches the first page, replacing what is shown.
export function useModerationLog(refreshToken: number): UseModerationLogResult {
  const [status, setStatus] = useState<UseModerationLogResult['status']>('loading')
  const [entries, setEntries] = useState<ModerationLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getModerationLog()
      .then((page) => {
        if (cancelled) return
        setEntries(page.entries)
        setNextCursor(page.next_cursor)
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
  }, [refreshToken])

  function loadMore() {
    if (nextCursor === null) return
    setLoadingMore(true)
    getModerationLog({ cursor: nextCursor })
      .then((page) => {
        setEntries((current) => [...current, ...page.entries])
        setNextCursor(page.next_cursor)
      })
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setLoadingMore(false))
  }

  return { status, entries, hasMore: nextCursor !== null, loadingMore, error, loadMore }
}
