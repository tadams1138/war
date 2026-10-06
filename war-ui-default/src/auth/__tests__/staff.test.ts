import { describe, expect, it } from 'vitest'
import { isStaff } from '../staff'

const voter = { id: 'v', display_name: null, avatar_url: null }

describe('isStaff', () => {
  it.each([
    [{ is_moderator: false, is_admin: false }, false],
    [{ is_moderator: true, is_admin: false }, true],
    [{ is_moderator: false, is_admin: true }, true],
  ])('treats %j as staff=%s', (flags, expected) => {
    // Arrange
    const me = { voter: { ...voter, ...flags } }

    // Act
    const result = isStaff(me)

    // Assert
    expect(result).toBe(expected)
  })
})
