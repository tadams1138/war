// Cursor-paged vote history of one Voter (war-spec.md §6.7).
import { getAdminVoterVotes, type AdminVoterVote } from '../../api/client'
import { useCursorPage } from '../../hooks/useCursorPage'

export interface UseVoterVotesResult {
  status: 'loading' | 'loaded' | 'error'
  votes: AdminVoterVote[]
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}

export function useVoterVotes(voterId: string): UseVoterVotesResult {
  const { items, ...rest } = useCursorPage(
    (cursor) => getAdminVoterVotes(voterId, { cursor }).then((page) => ({ items: page.votes, nextCursor: page.next_cursor })),
    [voterId],
  )
  return { ...rest, votes: items }
}
