import { describe, expect, it } from 'vitest'
import { canAssignRoles, canModerate, isRoleHolder } from '../roles'

const BOTH_FLAGS = [
  [{ is_moderator: false, is_admin: false }, { holder: false, moderate: false, assign: false }],
  [{ is_moderator: true, is_admin: false }, { holder: true, moderate: true, assign: false }],
  [{ is_moderator: false, is_admin: true }, { holder: true, moderate: false, assign: true }],
  [{ is_moderator: true, is_admin: true }, { holder: true, moderate: true, assign: true }],
] as const

describe('the role predicates', () => {
  it.each(BOTH_FLAGS)('treats %j as a role holder: %j', (flags, expected) => {
    // Arrange / Act
    const result = isRoleHolder(flags)

    // Assert
    expect(result).toBe(expected.holder)
  })

  it.each(BOTH_FLAGS)('lets %j moderate only with the Moderator role: %j', (flags, expected) => {
    // Arrange / Act
    const result = canModerate(flags)

    // Assert
    expect(result).toBe(expected.moderate)
  })

  it.each(BOTH_FLAGS)('lets %j assign roles only with the Admin role: %j', (flags, expected) => {
    // Arrange / Act
    const result = canAssignRoles(flags)

    // Assert
    expect(result).toBe(expected.assign)
  })
})
