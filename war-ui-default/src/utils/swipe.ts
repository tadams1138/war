// Swipe-vs-tap gesture disambiguation for ImageCarousel
// (the spec). Ambiguity must always resolve toward
// "swipe", never toward "vote" — a mis-fired vote is unrecoverable.
export const SWIPE_THRESHOLD_PX = 10

export function exceedsSwipeThreshold(deltaX: number): boolean {
  return Math.abs(deltaX) > SWIPE_THRESHOLD_PX
}

export function swipeDirection(deltaX: number): 'next' | 'previous' | null {
  if (deltaX <= -SWIPE_THRESHOLD_PX) return 'next'
  if (deltaX >= SWIPE_THRESHOLD_PX) return 'previous'
  return null
}
