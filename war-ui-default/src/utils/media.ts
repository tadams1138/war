// Which image is "primary" for a contestant, and how to build a srcset
// for one — the single most consequential piece of presentation in a fast
// binary vote (the spec). Used by both WarDetail's
// gallery and ImageCarousel; kept in one place so the two can never drift.
import type { MediaItem } from '../api/client'

export function byDisplayOrder(media: MediaItem[]): MediaItem[] {
  return [...media].sort((a, b) => a.display_order - b.display_order)
}

export function primaryMedia(media: MediaItem[]): MediaItem | undefined {
  return byDisplayOrder(media)[0]
}

export function srcSetFor(item: MediaItem): string {
  return item.variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ')
}
