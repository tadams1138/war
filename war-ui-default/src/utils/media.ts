// Which image is "primary" for a contestant, and how to build a srcset
// for one (war-spec.md §9.1) — the single most consequential piece of
// presentation in a fast binary vote. Shared by the results list and
// ImageCarousel so the two can't drift.
import type { MediaItem } from '../api/client'

export function byDisplayOrder(media: MediaItem[]): MediaItem[] {
  return [...media].sort((a, b) => a.display_order - b.display_order)
}

export function primaryMedia(media: MediaItem[]): MediaItem | undefined {
  return byDisplayOrder(media)[0]
}

export function largestVariant(item: MediaItem): MediaItem['variants'][number] {
  return item.variants.reduce((largest, variant) => (variant.width > largest.width ? variant : largest))
}

export function srcSetFor(item: MediaItem): string {
  return item.variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ')
}
