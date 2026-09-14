// The core voting UI (the spec). The API decides which
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
    <div data-testid="matchup-view" className="matchup-view">
      <ContestantCard contestant={matchup.left} disabled={votingInFlight} onVote={onSelect} />
      <div className="vs-divider" data-testid="vs-divider" aria-hidden="true">
        VS
      </div>
      <ContestantCard contestant={matchup.right} disabled={votingInFlight} onVote={onSelect} />
    </div>
  )
}
