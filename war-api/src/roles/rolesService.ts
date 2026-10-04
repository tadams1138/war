import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { Forbidden, MutationOutcome, NotFound } from '../shared/outcomes.js';
import { setVoterRole, type Voter } from '../auth/votersRepository.js';
import { logAction } from '../moderation/moderationLogRepository.js';

export type GrantRoleOutcome = MutationOutcome<Voter, NotFound | Forbidden>;

/**
 * Grants or revokes `role` on `targetVoterId` (spec §6.7). Caller-permission
 * (Admin-only) is enforced by `requireAdmin`, not here. The one exception an
 * Admin-only guard can't express is self-removal -- an Admin revoking their
 * own Admin role, which `requireAdmin` happily allows since the caller is an
 * Admin -- so that check lives here instead, where `callerVoterId` is available.
 * The role change and its moderation log entry commit together or not at all,
 * so no Staff action goes unrecorded.
 */
export async function grantRole(
  db: Kysely<Database>,
  callerVoterId: string,
  targetVoterId: string,
  role: 'moderator' | 'admin',
  granted: boolean,
): Promise<GrantRoleOutcome> {
  if (role === 'admin' && !granted && targetVoterId === callerVoterId) {
    return { kind: 'forbidden' };
  }
  return db.transaction().execute(async (trx): Promise<GrantRoleOutcome> => {
    const voter = await setVoterRole(trx, targetVoterId, role, granted);
    if (!voter) return { kind: 'notFound' };
    await logAction(trx, {
      action: `${granted ? 'grant' : 'revoke'}_role_${role}`,
      staffVoterId: callerVoterId,
      targetVoterId,
    });
    return { kind: 'ok', value: voter };
  });
}
