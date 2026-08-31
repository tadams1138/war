// Binary matchup voting, image mode only (war-ui-default-spec.md §4, §6,
// §12). Navigating here silently joins the War before the first matchup is
// requested — there is no visible Join control. Rendering only; the vote
// session's state machine lives in useVoteSession.
import { useParams } from 'react-router-dom'
import { MatchupView } from '../components/MatchupView'
import { ProgressBar } from '../components/ProgressBar'
import { useVoteSession } from '../vote/useVoteSession'

export function VoteMode() {
  const { id: warId } = useParams<{ id: string }>()
  const { state, selectContestant } = useVoteSession(warId)

  if (state.phase === 'loading') return <p>Loading…</p>
  if (state.phase === 'error') return <p role="alert">{state.message}</p>
  if (state.phase === 'completed') {
    return (
      <div data-testid="vote-complete">
        <h2>You&rsquo;ve voted on every matchup — thank you!</h2>
      </div>
    )
  }

  return (
    <main>
      <ProgressBar voted={state.progress.voted} total={state.progress.total} />
      {state.errorMessage && (
        <p role="status" data-testid="vote-error">
          {state.errorMessage}
        </p>
      )}
      <MatchupView matchup={state.matchup} votingInFlight={state.votingInFlight} onSelect={selectContestant} />
    </main>
  )
}
