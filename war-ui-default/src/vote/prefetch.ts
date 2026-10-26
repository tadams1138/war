import type { MediaItem } from '../api/client'
import { mediaDisplayUrl } from '../utils/media'

// The API's advisory prefetch block contains posters for upcoming video media.
// Warming those images never creates an offscreen provider player.
export function prefetchMatchupMedia(media: MediaItem[]): void {
  for (const item of media) {
    const url = mediaDisplayUrl(item)
    if (url) new Image().src = url
  }
}
