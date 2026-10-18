// What each role may do (war-spec.md §3, §6.7): a Moderator moderates, an
// Admin assigns roles, and neither implies the other. A role holder is a
// Moderator, an Admin or both.
import type { VoterMe } from '../api/client'

export type Roles = Pick<VoterMe['voter'], 'is_moderator' | 'is_admin'>

export function isRoleHolder(voter: Roles): boolean {
  return voter.is_moderator || voter.is_admin
}

export function canModerate(voter: Roles): boolean {
  return voter.is_moderator
}

export function canAssignRoles(voter: Roles): boolean {
  return voter.is_admin
}
