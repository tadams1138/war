// The Rankings page's state machine (war-ui-default-spec.md §4, §6, §12):
// fetches the leaderboard, then polls every 30 seconds while the War's
// `status` (spec §7.5's effective_status) is "active", stopping the moment
// it isn't. Extracted out of the page component so that one renders only,
// matching useVoteSession's split for VoteMode.
import { useEffect, useState } from 'react'
import { getRankings, type RankingsResponse } from '../api/client'
import { toUserMessage } from '../api/errors'

const POLL_INTERVAL_MS = 30_000

export type RankingsState =
  | { status: 'loading' }
  | { status: 'loaded'; rankings: RankingsResponse }
  | { status: 'error'; message: string }

export function useRankings(warId: string | undefined): RankingsState {
  const [state, setState] = useState<RankingsState>({ status: 'loading' })

  useEffect(() => {
    if (!warId) return

    // Guards state updates and the next poll against firing after this
    // effect's own cleanup. Declared per-run, not a ref shared across
    // warId changes (useVoteSession's cancelledRef idiom) — a ref would let
    // an in-flight fetch for a *previous* warId resume once the next
    // effect run resets it to false, showing another War's board and
    // leaving two self-rescheduling poll loops running.
    let cancelled = false
    let timer: number | undefined

    async function load(id: string) {
      try {
        const rankings = await getRankings(id)
        if (cancelled) return
        setState({ status: 'loaded', rankings })
        if (rankings.status === 'active') {
          timer = window.setTimeout(() => void load(id), POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: toUserMessage(error) })
      }
    }

    void load(warId)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [warId])

  return state
}
