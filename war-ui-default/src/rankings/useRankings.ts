// The Rankings page's state machine (war-ui-default-spec.md §4, §6, §12):
// fetches the leaderboard, then polls every 30 seconds while the War's
// `status` (spec §7.5's effective_status) is "active", stopping the moment
// it isn't. Extracted out of the page component so that one renders only,
// matching useVoteSession's split for VoteMode.
import { useEffect, useRef, useState } from 'react'
import { getRankings, type RankingsResponse } from '../api/client'
import { toUserMessage } from '../api/errors'

const POLL_INTERVAL_MS = 30_000

export type RankingsState =
  | { status: 'loading' }
  | { status: 'loaded'; rankings: RankingsResponse }
  | { status: 'error'; message: string }

export function useRankings(warId: string | undefined): RankingsState {
  const [state, setState] = useState<RankingsState>({ status: 'loading' })
  // Guards state updates and the next poll against firing after unmount —
  // the same pattern useVoteSession uses for its own async work.
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    if (!warId) return

    let timer: number | undefined

    async function load() {
      try {
        const rankings = await getRankings(warId!)
        if (cancelledRef.current) return
        setState({ status: 'loaded', rankings })
        if (rankings.status === 'active') {
          timer = window.setTimeout(load, POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (!cancelledRef.current) setState({ status: 'error', message: toUserMessage(error) })
      }
    }

    void load()
    return () => {
      cancelledRef.current = true
      window.clearTimeout(timer)
    }
  }, [warId])

  return state
}
