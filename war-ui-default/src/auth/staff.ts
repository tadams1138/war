// Staff means a Moderator or an Admin (the spec, §6.7).
import type { VoterMe } from '../api/client'

export function isStaff(me: VoterMe): boolean {
  return me.voter.is_moderator || me.voter.is_admin
}
