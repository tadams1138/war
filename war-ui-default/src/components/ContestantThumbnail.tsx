// The primary-thumbnail <img>, used by both the rankings leaderboard
// (RankingsTable) and the War detail contestant gallery (WarDetail) —
// pulled into one place so the two can't drift, per utils/media.ts's own
// header ("kept in one place so the two can never drift").
import type { MediaItem } from '../api/client'
import { primaryMedia, srcSetFor } from '../utils/media'

interface ContestantThumbnailProps {
  media: MediaItem[]
  name: string
}

export function ContestantThumbnail({ media, name }: ContestantThumbnailProps) {
  const image = primaryMedia(media)
  if (!image) return null

  return (
    <img
      alt={name}
      src={image.variants[0]?.url}
      srcSet={srcSetFor(image)}
      style={{ aspectRatio: image.aspect_ratio ?? undefined }}
    />
  )
}
