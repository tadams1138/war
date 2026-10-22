/** The moderation-log action of each kind of owner-level request an Admin makes on a War they did not create (§6.7). */
export type OwnerAction =
  | 'edit_war'
  | 'set_share_image'
  | 'add_contestant'
  | 'edit_contestant'
  | 'remove_contestant'
  | 'add_image'
  | 'reorder_images'
  | 'remove_image'
  | 'publish_war'
  | 'unpublish_war'
  | 'clear_votes'
  | 'delete_war';

export const OWNER_ACTIONS: readonly OwnerAction[] = [
  'edit_war',
  'set_share_image',
  'add_contestant',
  'edit_contestant',
  'remove_contestant',
  'add_image',
  'reorder_images',
  'remove_image',
  'publish_war',
  'unpublish_war',
  'clear_votes',
  'delete_war',
];

