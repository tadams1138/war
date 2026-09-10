import { describe, expect, it } from 'vitest'
import { FALLBACK_DISPLAY_NAME, resolveVoterIdentity } from './voterIdentity'

describe('resolveVoterIdentity', () => {
  it('renders the voter\'s display_name and avatar_url when loaded', () => {
    // Arrange
    const state = {
      status: 'loaded' as const,
      value: { voter: { id: 'voter-1', display_name: 'Jordan', avatar_url: 'https://cdn.example.test/a.png' } },
    }

    // Act
    const identity = resolveVoterIdentity(state)

    // Assert
    expect(identity).toEqual({ displayName: 'Jordan', avatarUrl: 'https://cdn.example.test/a.png' })
  })

  it('falls back to a fixed label when display_name is null', () => {
    // Arrange
    const state = {
      status: 'loaded' as const,
      value: { voter: { id: 'voter-1', display_name: null, avatar_url: null } },
    }

    // Act
    const identity = resolveVoterIdentity(state)

    // Assert — the literal, not the imported constant: this pins the label
    // itself, not just that the mapping returns whatever the constant holds.
    expect(identity).toEqual({ displayName: 'Voter', avatarUrl: null })
  })

  it('falls back to the same label, with no avatar, when the GET /auth/me request fails', () => {
    // Arrange — the spec "NavBar": a failed profile fetch
    // never blocks navigation; only the identity slot falls back.
    const state = { status: 'error' as const, message: 'Server error — please try again shortly' }

    // Act
    const identity = resolveVoterIdentity(state)

    // Assert
    expect(identity).toEqual({ displayName: FALLBACK_DISPLAY_NAME, avatarUrl: null })
  })

  it('falls back to the same label, with no avatar, while the request is still loading', () => {
    // Arrange
    const state = { status: 'loading' as const }

    // Act
    const identity = resolveVoterIdentity(state)

    // Assert
    expect(identity).toEqual({ displayName: FALLBACK_DISPLAY_NAME, avatarUrl: null })
  })
})
