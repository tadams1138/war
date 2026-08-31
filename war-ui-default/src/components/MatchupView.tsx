// The core voting UI (war-ui-default-spec.md §6). The API decides which
// contestant is left and which is right — this renders that order verbatim
// and must never reorder the pair.
import type { NextMatchupResponse } from '../api/client'
import { ContestantCard } from './ContestantCard'

interface MatchupViewProps {
  matchup: NextMatchupResponse['matchup']
  votingInFlight: boolean
  onSelect: (contestantId: string) => void
}

export function MatchupView({ matchup, votingInFlight, onSelect }: MatchupViewProps) {
  return (
    <div data-testid="matchup-view" style={{ display: 'flex', gap: '1rem' }}>
      <ContestantCard contestant={matchup.left} disabled={votingInFlight} onVote={onSelect} />
      <ContestantCard contestant={matchup.right} disabled={votingInFlight} onVote={onSelect} />
    </div>
  )
}
