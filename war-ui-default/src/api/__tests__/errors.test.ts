import { describe, expect, it } from 'vitest'
import { ApiError, messageForReason, toUserMessage } from '../errors'

describe('messageForReason', () => {
  it('maps each reason to the exact copy in the spec\'s table', () => {
    // Arrange
    const reasons = ['unauthorized', 'war-closed', 'not-joined', 'not-found', 'validation', 'server-error', 'network'] as const

    // Act
    const messages = reasons.map((reason) => messageForReason(reason))

    // Assert
    expect(messages).toEqual([
      'Please log in to continue',
      'This War is locked — voting is closed',
      'Join this War to vote',
      "This War doesn't exist or has been removed",
      'Something went wrong — please try again',
      'Server error — please try again shortly',
      'Unable to reach the server — check your connection',
    ])
  })

  it('returns no message for a conflict — the caller advances silently instead', () => {
    // Arrange
    const input = 'conflict'

    // Act
    const message = messageForReason(input)

    // Assert
    expect(message).toBe('')
  })

  it('includes the retry-after delay in the rate-limited message', () => {
    // Arrange
    const retryAfterSeconds = 5

    // Act
    const message = messageForReason('rate-limited', retryAfterSeconds)

    // Assert
    expect(message).toContain('try again')
    expect(message).toContain('5')
  })
})

describe('toUserMessage', () => {
  it("returns the ApiError's own message when the error is one", () => {
    // Arrange
    const error = new ApiError('not-found', 404, "This War doesn't exist or has been removed")

    // Act
    const message = toUserMessage(error)

    // Assert
    expect(message).toBe("This War doesn't exist or has been removed")
  })

  it('falls back to the network message for anything else', () => {
    // Arrange
    const errors = [new TypeError('boom'), 'not even an error']

    // Act
    const messages = errors.map(toUserMessage)

    // Assert
    expect(messages).toEqual([
      'Unable to reach the server — check your connection',
      'Unable to reach the server — check your connection',
    ])
  })
})

describe('ApiError', () => {
  it('carries its reason, status, and an optional retry-after delay', () => {
    // Arrange
    const message = 'Slow down a moment — try again in 5s'

    // Act
    const error = new ApiError('rate-limited', 429, message, 5)

    // Assert
    expect(error).toBeInstanceOf(Error)
    expect(error.reason).toBe('rate-limited')
    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(5)
    expect(error.message).toBe('Slow down a moment — try again in 5s')
  })

  it('carries an optional details array for a validation failure', () => {
    // Arrange
    const details = ['title must be a non-empty string of at most 256 characters']

    // Act
    const error = new ApiError('validation', 422, 'Something went wrong — please try again', undefined, details)

    // Assert
    expect(error.details).toEqual(['title must be a non-empty string of at most 256 characters'])
  })

  it('leaves details undefined when none were given', () => {
    // Arrange
    const message = 'Something went wrong — please try again'

    // Act
    const error = new ApiError('validation', 422, message)

    // Assert
    expect(error.details).toBeUndefined()
  })
})
