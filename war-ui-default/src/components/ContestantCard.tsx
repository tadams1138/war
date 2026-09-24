// The core voting UI's per-contestant card (war-spec.md §10.3).
// Shows image and name only — voting is a fast binary choice.
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
  return (
    <div data-testid="contestant-card" aria-disabled={disabled} aria-busy={disabled} className="contestant-card">
      <ImageCarousel media={contestant.media} disabled={disabled} onTap={() => onVote(contestant.id)} fillHeight>
        <p>{contestant.name}</p>
      </ImageCarousel>
    </div>
  )
}
