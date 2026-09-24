// Binary matchup voting, image mode only (war-spec.md §10.3). Navigating here
// silently joins the War before the first matchup is
// requested — there is no visible Join control. Rendering only; the vote
// session's state machine lives in useVoteSession.
import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getWar, type WarDetailResponse } from '../api/client'
import { MatchupView } from '../components/MatchupView'
import { ProgressBar } from '../components/ProgressBar'
import { useAsyncResource, type AsyncResourceState } from '../hooks/useAsyncResource'
import type { Theme } from '../theme/themeCookie'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { useVoteSession } from '../vote/useVoteSession'

// Scrolls the tap-to-vote block to the top of the viewport once, the first
// time a matchup is ready (war-spec.md 10.3: "the page opens scrolled to
// the top of this block, past the persistent header"). Only fires once per
// page visit -- re-scrolling after every vote would fight a voter who has
// deliberately scrolled down to read a bio. Queries by testid rather than a
// ref: MatchupView (a wide vs. narrow layout, useNarrowViewport) owns which
// element that is, not this page.
function useScrollToVoteViewportOnce(ready: boolean) {
  const hasScrolled = useRef(false)

  useEffect(() => {
    if (!ready || hasScrolled.current) return
    const target = document.querySelector('[data-testid="vote-layout"]')
    if (!target) return
    hasScrolled.current = true
    target.scrollIntoView({ block: 'start' })
  }, [ready])
}

function orEmpty(value: string | undefined): string {
  return value ?? ''
}

function loadWar(warId: string | undefined): (() => Promise<WarDetailResponse>) | undefined {
  return warId ? () => getWar(warId) : undefined
}

function initialTheme(warState: AsyncResourceState<WarDetailResponse>): Theme {
  return warState.status === 'loaded' ? warState.value.theme : 'arcade'
}

export function VoteMode() {
  const { id: warId } = useParams<{ id: string }>()
  const safeWarId = orEmpty(warId)
  const { state, selectContestant } = useVoteSession(warId)
  const warState = useAsyncResource(loadWar(warId), [warId])
  const [theme, setTheme] = useTheme(safeWarId, initialTheme(warState))
  usePublishTheme(safeWarId, theme, setTheme)
  useScrollToVoteViewportOnce(state.phase === 'active')

  if (state.phase === 'loading') return <p>Loading…</p>
  if (state.phase === 'error') return <p role="alert">{state.message}</p>
  if (state.phase === 'completed') {
    return (
      <div data-testid="vote-complete">
        <h2>You&rsquo;ve voted on every matchup — thank you!</h2>
        <Link to={`/wars/${warId}`} data-testid="view-results-link">
          See the results
        </Link>
      </div>
    )
  }

  return (
    <main data-theme={theme}>
      <MatchupView
        matchup={state.matchup}
        votingInFlight={state.votingInFlight}
        onSelect={selectContestant}
        progressBar={<ProgressBar voted={state.progress.voted} total={state.progress.total} />}
        errorMessage={
          state.errorMessage && (
            <p role="status" data-testid="vote-error">
              {state.errorMessage}
            </p>
          )
        }
      />
    </main>
  )
}
