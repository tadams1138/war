// The vote-session state machine for VoteMode (the spec): join
// orchestration, matchup fetching, vote submission, error
// classification, and the rate-limit wait. Extracted out of VoteMode so
// that component is rendering only — the transitions here (409 advances
// silently, 429 keeps cards busy then re-enables, everything else shows
// an error and re-enables) are the heart of the voting loop.
import { useEffect, useRef, useState } from 'react'
import { castVote, getNextMatchup, joinWar, type NextMatchupResponse } from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'

type Matchup = NextMatchupResponse['matchup']
type Progress = NextMatchupResponse['progress']

type ActiveState = {
  phase: 'active'
  matchup: Matchup
  progress: Progress
  votingInFlight: boolean
  errorMessage: string | null
}

export type VoteSessionState =
  | { phase: 'loading' }
  | ActiveState
  | { phase: 'completed' }
  | { phase: 'error'; message: string }

export interface VoteSession {
  state: VoteSessionState
  selectContestant: (contestantId: string) => void
}

export function useVoteSession(warId: string | undefined): VoteSession {
  const [state, setState] = useState<VoteSessionState>({ phase: 'loading' })
  // Guards every setState below against firing after unmount — the join
  // and matchup fetches, and the rate-limit timer, all outlive a single
  // render and this component can be navigated away from mid-flight.
  const cancelledRef = useRef(false)
  const rateLimitTimerRef = useRef<number | undefined>(undefined)

  async function loadNext(id: string) {
    try {
      const next = await getNextMatchup(id)
      if (cancelledRef.current) return
      if (next === null) {
        setState({ phase: 'completed' })
        return
      }
      setState({
        phase: 'active',
        matchup: next.matchup,
        progress: next.progress,
        votingInFlight: false,
        errorMessage: null,
      })
    } catch (error) {
      if (!cancelledRef.current) setState({ phase: 'error', message: toUserMessage(error) })
    }
  }

  useEffect(() => {
    cancelledRef.current = false
    if (!warId) return
    async function init(id: string) {
      try {
        await joinWar(id)
      } catch {
        // Defensive fallback: proceed regardless. If the join truly
        // failed, the first vote attempt surfaces "Join this War to vote".
      }
      await loadNext(id)
    }
    void init(warId)
    return () => {
      cancelledRef.current = true
      window.clearTimeout(rateLimitTimerRef.current)
    }
  }, [warId])

  function setActiveState(updater: (prev: ActiveState) => ActiveState) {
    setState((prev) => (prev.phase === 'active' ? updater(prev) : prev))
  }

  function handleVoteError(error: unknown) {
    if (error instanceof ApiError && error.reason === 'conflict') {
      if (warId) void loadNext(warId)
      return
    }
    if (error instanceof ApiError && error.reason === 'rate-limited') {
      applyRateLimit(error)
      return
    }
    setActiveState((prev) => ({ ...prev, votingInFlight: false, errorMessage: toUserMessage(error) }))
  }

  function applyRateLimit(error: ApiError) {
    setActiveState((prev) => ({ ...prev, votingInFlight: true, errorMessage: error.message }))
    rateLimitTimerRef.current = window.setTimeout(() => {
      if (cancelledRef.current) return
      setActiveState((prev) => ({ ...prev, votingInFlight: false, errorMessage: null }))
    }, (error.retryAfterSeconds ?? 0) * 1000)
  }

  async function selectContestant(contestantId: string) {
    if (!warId || state.phase !== 'active' || state.votingInFlight) return
    const matchupId = state.matchup.id
    setActiveState((prev) => ({ ...prev, votingInFlight: true, errorMessage: null }))
    try {
      await castVote(warId, matchupId, contestantId)
      if (!cancelledRef.current) await loadNext(warId)
    } catch (error) {
      if (!cancelledRef.current) handleVoteError(error)
    }
  }

  return { state, selectContestant }
}
