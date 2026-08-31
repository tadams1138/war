import { afterEach, describe, expect, it } from 'vitest'
import { consumeReturnTo, loginUrlFor, storeReturnTo } from '../returnTo'

describe('loginUrlFor', () => {
  it('builds a /login URL with only returnTo when no reason is given', () => {
    // Arrange / Act
    const url = loginUrlFor('/wars/abc-123/vote')

    // Assert
    expect(url).toBe('/login?returnTo=%2Fwars%2Fabc-123%2Fvote')
  })

  it('puts returnTo before reason when a reason is given', () => {
    // Arrange / Act
    const url = loginUrlFor('/wars/neutral-page', 'session-expired')

    // Assert
    expect(url).toBe('/login?returnTo=%2Fwars%2Fneutral-page&reason=session-expired')
  })
})

describe('storeReturnTo / consumeReturnTo', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('round-trips a stored returnTo and clears it on read', () => {
    // Arrange
    storeReturnTo('/wars/abc-123/vote')

    // Act
    const first = consumeReturnTo()
    const second = consumeReturnTo()

    // Assert
    expect(first).toBe('/wars/abc-123/vote')
    expect(second).toBe('/')
  })

  it('defaults to "/" when nothing was stored', () => {
    // Arrange / Act
    const returnTo = consumeReturnTo()

    // Assert
    expect(returnTo).toBe('/')
  })
})
