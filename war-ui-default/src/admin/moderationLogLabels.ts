// Human-readable labels for the moderation log's known actions (war-spec.md,
// §6.7). An action this UI doesn't know yet (the API may add one) is shown as
// its raw string rather than hidden or mislabelled.
const ACTION_LABELS: Record<string, string> = {
  grant_role_moderator: 'Granted Moderator role',
  grant_role_admin: 'Granted Admin role',
  revoke_role_moderator: 'Revoked Moderator role',
  revoke_role_admin: 'Revoked Admin role',
  enable_war_creation_kill_switch: 'Enabled the War-creation kill switch',
  disable_war_creation_kill_switch: 'Disabled the War-creation kill switch',
  remove_war: 'Removed a War',
  suspend_voter: 'Suspended a Voter',
  unsuspend_voter: 'Unsuspended a Voter',
  ban_voter: 'Banned a Voter',
  unban_voter: 'Unbanned a Voter',
  edit_war: 'Edited a War',
  set_share_image: "Set a War's share image",
  add_contestant: 'Added a contestant',
  edit_contestant: 'Edited a contestant',
  remove_contestant: 'Removed a contestant',
  add_image: 'Added an image',
  reorder_images: 'Reordered images',
  remove_image: 'Removed an image',
  publish_war: 'Published a War',
  unpublish_war: 'Unpublished a War',
  clear_votes: "Cleared a War's votes",
  delete_war: 'Deleted a War',
}

export function actionLabel(action: string): string {
  return Object.hasOwn(ACTION_LABELS, action) ? ACTION_LABELS[action] : action
}
