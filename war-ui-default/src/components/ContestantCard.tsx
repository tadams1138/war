// The core voting UI's per-contestant card (war-spec.md §10.3).
// Shows image and name only — voting is a fast binary choice. A contestant
// with no media has nothing to tap, so a Vote button stands where the media
// would be (and is the card's single tab stop).
import type { MediaItem } from '../api/client'
import { ImageCarousel } from './ImageCarousel'

interface Contestant {
  id: string
  name: string
  media: MediaItem[]
}

interface ContestantCardProps {
  contestant: Contestant
  disabled: boolean
  onVote: (contestantId: string) => void
}

export function ContestantCard({ contestant, disabled, onVote }: ContestantCardProps) {
  const hasMedia = contestant.media.length > 0
  return (
    <div
      data-testid="contestant-card"
      aria-disabled={disabled}
      aria-busy={disabled}
      className={hasMedia ? 'contestant-card' : 'contestant-card contestant-card--no-media'}
    >
      {hasMedia ? (
        <MediaCard contestant={contestant} disabled={disabled} onVote={onVote} />
      ) : (
        <>
          <p>{contestant.name}</p>
          <button type="button" className="vote-button" disabled={disabled} onClick={() => onVote(contestant.id)}>
            Vote
          </button>
        </>
      )}
    </div>
  )
}

function MediaCard({ contestant, disabled, onVote }: ContestantCardProps) {
  return (
    <ImageCarousel media={contestant.media} disabled={disabled} onTap={() => onVote(contestant.id)} fillHeight>
      <p>{contestant.name}</p>
    </ImageCarousel>
  )
}
