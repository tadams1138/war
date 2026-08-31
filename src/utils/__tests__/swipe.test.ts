import { describe, expect, it } from 'vitest'
import { SWIPE_THRESHOLD_PX, exceedsSwipeThreshold, swipeDirection } from '../swipe'

describe('exceedsSwipeThreshold', () => {
  it('is false for movement at or under the threshold', () => {
    // Arrange / Act / Assert
    expect(exceedsSwipeThreshold(0)).toBe(false)
    expect(exceedsSwipeThreshold(SWIPE_THRESHOLD_PX)).toBe(false)
  })

  it('is true once horizontal movement exceeds the threshold, in either direction', () => {
    // Arrange / Act / Assert
    expect(exceedsSwipeThreshold(SWIPE_THRESHOLD_PX + 1)).toBe(true)
    expect(exceedsSwipeThreshold(-(SWIPE_THRESHOLD_PX + 1))).toBe(true)
  })
})

describe('swipeDirection', () => {
  it('reports "next" for a leftward release past the threshold', () => {
    // Arrange / Act / Assert
    expect(swipeDirection(-(SWIPE_THRESHOLD_PX + 5))).toBe('next')
  })

  it('reports "previous" for a rightward release past the threshold', () => {
    // Arrange / Act / Assert
    expect(swipeDirection(SWIPE_THRESHOLD_PX + 5)).toBe('previous')
  })

  it('reports no direction when the release lands back near the start', () => {
    // Arrange / Act / Assert
    expect(swipeDirection(2)).toBeNull()
  })
})
