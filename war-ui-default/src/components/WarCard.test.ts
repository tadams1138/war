import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { timeRemainingLabel } from './WarCard'

describe('timeRemainingLabel', () => {
  const now = new Date('2026-09-01T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "Ended" when ends_at is in the past', () => {
    // Arrange
    const endsAt = new Date(now.getTime() - 1000).toISOString()

    // Act
    const label = timeRemainingLabel(endsAt)

    // Assert
    expect(label).toBe('Ended')
  })

  it('renders "Ended" when ends_at is exactly now', () => {
    // Arrange
    const endsAt = now.toISOString()

    // Act
    const label = timeRemainingLabel(endsAt)

    // Assert
    expect(label).toBe('Ended')
  })

  it('uses the singular "day" when exactly one day remains', () => {
    // Arrange
    const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

    // Act
    const label = timeRemainingLabel(endsAt)

    // Assert
    expect(label).toBe('Ends in 1 day')
  })

  it('uses the plural "days" when more than one day remains', () => {
    // Arrange
    const endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

    // Act
    const label = timeRemainingLabel(endsAt)

    // Assert
    expect(label).toBe('Ends in 3 days')
  })

  it('does not round five minutes remaining up to a full day', () => {
    // Arrange — Math.ceil on a sub-day remainder rounds any positive amount
    // of time up to "1 day", which is misleading with minutes left.
    const endsAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()

    // Act
    const label = timeRemainingLabel(endsAt)

    // Assert
    expect(label).not.toBe('Ends in 1 day')
  })
})
