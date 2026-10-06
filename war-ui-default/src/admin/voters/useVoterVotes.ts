// Cursor-paged vote history of one Voter (the spec, §6.7): the first page
// loads on mount; `loadMore` appends the page after `nextCursor`.
import { useEffect, useState } from 'react'
import { getAdminVoterVotes, type AdminVoterVote } from '../../api/client'
import { toUserMessage } from '../../api/errors'

export interface UseVoterVotesResult {
  status: 'loading' | 'loaded' | 'error'
  votes: AdminVoterVote[]
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}

export function useVoterVotes(voterId: string): UseVoterVotesResult {
  const [status, setStatus] = useState<UseVoterVotesResult['status']>('loading')
  const [votes, setVotes] = useState<AdminVoterVote[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAdminVoterVotes(voterId)
      .then((page) => {
        if (cancelled) return
        setVotes(page.votes)
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
  }, [voterId])

  function loadMore() {
    if (nextCursor === null) return
    setLoadingMore(true)
    getAdminVoterVotes(voterId, { cursor: nextCursor })
      .then((page) => {
        setVotes((current) => [...current, ...page.votes])
        setNextCursor(page.next_cursor)
      })
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setLoadingMore(false))
  }

  return { status, votes, error, hasMore: nextCursor !== null, loadingMore, loadMore }
}
