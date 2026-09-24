// The core voting UI (the spec). The API decides which contestant is left
// and which is right — this renders that order verbatim and must never
// reorder the pair. A bio, when a contestant has one, renders in its own
// area outside the tap-to-vote media (war-spec.md 10.3) — never inside
// ContestantCard's own gesture-handling element, so reading it can never
// register as a vote.
//
// Owns the vote page's whole "fills the viewport, no scroll needed to
// vote" block (`.vote-viewport`), not just the two cards, since where a
// bio lives structurally differs by breakpoint: on a wide viewport it's a
// sibling *after* that block, reachable by scrolling down past it; on a
// narrow one, where both contestants must stay visible together, it's
// paired inside the block, beside its own card. That's a real difference
// in which element is a bio's parent, not something a media query alone
// can express, so the breakpoint is read here in JS (useNarrowViewport)
// rather than left to CSS.
import type { ReactNode } from 'react'
import type { NextMatchupResponse } from '../api/client'
import { BioContent } from '../bio/BioContent'
import { useNarrowViewport } from '../hooks/useNarrowViewport'
import { ContestantCard } from './ContestantCard'

interface MatchupViewProps {
  matchup: NextMatchupResponse['matchup']
  votingInFlight: boolean
  onSelect: (contestantId: string) => void
  progressBar: ReactNode
  errorMessage: ReactNode
}

function WideMatchup({ leftCard, vsBadge, rightCard, leftBio, rightBio, progressBar, errorMessage }: MatchupPieces) {
  return (
    <>
      <div className="vote-viewport" data-testid="vote-layout">
        <div className="vote-progress">
          {progressBar}
          {errorMessage}
        </div>
        <div className="matchup-cards" data-testid="matchup-view">
          {leftCard}
          {vsBadge}
          {rightCard}
        </div>
      </div>
      <div className="matchup-bios">
        {leftBio}
        {rightBio}
      </div>
    </>
  )
}

function NarrowMatchup({ leftCard, vsBadge, rightCard, leftBio, rightBio, progressBar, errorMessage }: MatchupPieces) {
  return (
    <div className="vote-viewport" data-testid="vote-layout">
      <div className="vote-progress">
        {progressBar}
        {errorMessage}
      </div>
      <div className="matchup-view" data-testid="matchup-view">
        <div className="matchup-row">
          {leftCard}
          {leftBio}
        </div>
        {vsBadge}
        <div className="matchup-row">
          {rightCard}
          {rightBio}
        </div>
      </div>
    </div>
  )
}

interface MatchupPieces {
  leftCard: ReactNode
  vsBadge: ReactNode
  rightCard: ReactNode
  leftBio: ReactNode
  rightBio: ReactNode
  progressBar: ReactNode
  errorMessage: ReactNode
}

export function MatchupView({ matchup, votingInFlight, onSelect, progressBar, errorMessage }: MatchupViewProps) {
  const narrow = useNarrowViewport()

  const pieces: MatchupPieces = {
    leftCard: (
      <div className="matchup-card" data-testid="matchup-card-left">
        <ContestantCard key={matchup.left.id} contestant={matchup.left} disabled={votingInFlight} onVote={onSelect} />
      </div>
    ),
    vsBadge: (
      <div className="vs-divider" data-testid="vs-divider" aria-hidden="true">
        VS
      </div>
    ),
    rightCard: (
      <div className="matchup-card" data-testid="matchup-card-right">
        <ContestantCard key={matchup.right.id} contestant={matchup.right} disabled={votingInFlight} onVote={onSelect} />
      </div>
    ),
    leftBio: (
      <div className="matchup-bio" data-testid="matchup-bio-left">
        <BioContent bio={matchup.left.bio} />
      </div>
    ),
    rightBio: (
      <div className="matchup-bio" data-testid="matchup-bio-right">
        <BioContent bio={matchup.right.bio} />
      </div>
    ),
    progressBar,
    errorMessage,
  }

  return narrow ? <NarrowMatchup {...pieces} /> : <WideMatchup {...pieces} />
}
