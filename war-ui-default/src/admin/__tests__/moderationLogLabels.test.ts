import { describe, expect, it } from 'vitest'
import { actionLabel } from '../moderationLogLabels'

describe('actionLabel', () => {
  it.each([
    ['grant_role_moderator', 'Granted Moderator role'],
    ['grant_role_admin', 'Granted Admin role'],
    ['revoke_role_moderator', 'Revoked Moderator role'],
    ['revoke_role_admin', 'Revoked Admin role'],
    ['enable_war_creation_kill_switch', 'Enabled the War-creation kill switch'],
    ['disable_war_creation_kill_switch', 'Disabled the War-creation kill switch'],
    ['remove_war', 'Removed a War'],
    ['suspend_voter', 'Suspended a Voter'],
    ['unsuspend_voter', 'Unsuspended a Voter'],
    ['ban_voter', 'Banned a Voter'],
    ['unban_voter', 'Unbanned a Voter'],
    ['edit_war', 'Edited a War'],
    ['set_share_image', "Set a War's share image"],
    ['add_contestant', 'Added a contestant'],
    ['edit_contestant', 'Edited a contestant'],
    ['remove_contestant', 'Removed a contestant'],
    ['add_image', 'Added an image'],
    ['reorder_images', 'Reordered images'],
    ['remove_image', 'Removed an image'],
    ['publish_war', 'Published a War'],
    ['unpublish_war', 'Unpublished a War'],
    ['clear_votes', "Cleared a War's votes"],
    ['export_war', 'Exported a War'],
    ['delete_war', 'Deleted a War'],
  ])('labels %s as %s', (action, expected) => {
    // Arrange
    const input = action

    // Act
    const label = actionLabel(input)

    // Assert
    expect(label).toBe(expected)
  })

  it('falls back to the raw action string for an unknown action', () => {
    // Arrange
    const input = 'some_future_action'

    // Act
    const label = actionLabel(input)

    // Assert
    expect(label).toBe('some_future_action')
  })
})
