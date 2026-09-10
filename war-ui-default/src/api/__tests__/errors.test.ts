import { describe, expect, it } from 'vitest'
import { ApiError, messageForReason, toUserMessage } from '../errors'

describe('messageForReason', () => {
  it('maps each reason to the exact copy in the spec\'s table', () => {
    // Arrange / Act / Assert
    expect(messageForReason('unauthorized')).toBe('Please log in to continue')
    expect(messageForReason('war-closed')).toBe('This War is locked — voting is closed')
    expect(messageForReason('not-joined')).toBe('Join this War to vote')
    expect(messageForReason('not-found')).toBe("This War doesn't exist or has been removed")
    expect(messageForReason('validation')).toBe('Something went wrong — please try again')
    expect(messageForReason('server-error')).toBe('Server error — please try again shortly')
    expect(messageForReason('network')).toBe('Unable to reach the server — check your connection')
  })

  it('returns no message for a conflict — the caller advances silently instead', () => {
    // Arrange / Act
    const message = messageForReason('conflict')

    // Assert
    expect(message).toBe('')
  })

  it('includes the retry-after delay in the rate-limited message', () => {
    // Arrange / Act
    const message = messageForReason('rate-limited', 5)

    // Assert
    expect(message).toContain('try again')
    expect(message).toContain('5')
  })
})

describe('toUserMessage', () => {
  it("returns the ApiError's own message when the error is one", () => {
    // Arrange
    const error = new ApiError('not-found', 404, "This War doesn't exist or has been removed")

    // Act / Assert
    expect(toUserMessage(error)).toBe("This War doesn't exist or has been removed")
  })

  it('falls back to the network message for anything else', () => {
    // Arrange / Act / Assert
    expect(toUserMessage(new TypeError('boom'))).toBe('Unable to reach the server — check your connection')
    expect(toUserMessage('not even an error')).toBe('Unable to reach the server — check your connection')
  })
})

describe('ApiError', () => {
  it('carries its reason, status, and an optional retry-after delay', () => {
    // Arrange / Act
    const error = new ApiError('rate-limited', 429, 'Slow down a moment — try again in 5s', 5)

    // Assert
    expect(error).toBeInstanceOf(Error)
    expect(error.reason).toBe('rate-limited')
    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(5)
    expect(error.message).toBe('Slow down a moment — try again in 5s')
  })

  it('carries an optional details array for a validation failure', () => {
    // Arrange / Act
    const error = new ApiError('validation', 422, 'Something went wrong — please try again', undefined, [
      'title must be a non-empty string of at most 256 characters',
    ])

    // Assert
    expect(error.details).toEqual(['title must be a non-empty string of at most 256 characters'])
  })

  it('leaves details undefined when none were given', () => {
    // Arrange / Act
    const error = new ApiError('validation', 422, 'Something went wrong — please try again')

    // Assert
    expect(error.details).toBeUndefined()
  })
})
