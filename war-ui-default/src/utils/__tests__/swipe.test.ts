import { describe, expect, it } from 'vitest'
import { SWIPE_THRESHOLD_PX, exceedsSwipeThreshold, swipeDirection } from '../swipe'

describe('exceedsSwipeThreshold', () => {
  it('is false for movement at or under the threshold', () => {
    // Arrange
    const movements = [0, SWIPE_THRESHOLD_PX]

    // Act
    const results = movements.map(exceedsSwipeThreshold)

    // Assert
    expect(results).toEqual([false, false])
  })

  it('is true once horizontal movement exceeds the threshold, in either direction', () => {
    // Arrange
    const movements = [SWIPE_THRESHOLD_PX + 1, -(SWIPE_THRESHOLD_PX + 1)]

    // Act
    const results = movements.map(exceedsSwipeThreshold)

    // Assert
    expect(results).toEqual([true, true])
  })
})

describe('swipeDirection', () => {
  it('reports "next" for a leftward release past the threshold', () => {
    // Arrange
    const movement = -(SWIPE_THRESHOLD_PX + 5)

    // Act
    const direction = swipeDirection(movement)

    // Assert
    expect(direction).toBe('next')
  })

  it('reports "previous" for a rightward release past the threshold', () => {
    // Arrange
    const movement = SWIPE_THRESHOLD_PX + 5

    // Act
    const direction = swipeDirection(movement)

    // Assert
    expect(direction).toBe('previous')
  })

  it('reports no direction when the release lands back near the start', () => {
    // Arrange
    const movement = 2

    // Act
    const direction = swipeDirection(movement)

    // Assert
    expect(direction).toBeNull()
  })
})
