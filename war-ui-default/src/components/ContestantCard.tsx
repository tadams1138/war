// The core voting UI's per-contestant card (the spec).
// Shows image and name only — contestant attributes appear on the War
// detail page, never here (voting is a fast binary choice).
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
    <div data-testid="contestant-card" aria-disabled={disabled} aria-busy={disabled} style={{ flex: '1 1 0%', minWidth: 0 }}>
      <ImageCarousel media={contestant.media} disabled={disabled} onTap={() => onVote(contestant.id)}>
        <p>{contestant.name}</p>
      </ImageCarousel>
    </div>
  )
}
