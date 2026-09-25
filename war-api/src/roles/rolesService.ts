import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { MutationOutcome, NotFound } from '../shared/outcomes.js';
import { setVoterRole, type Voter } from '../auth/votersRepository.js';

export type GrantRoleOutcome = MutationOutcome<Voter, NotFound>;

/** Grants or revokes `role` on `targetVoterId` (spec §6.7). Caller-permission (Admin-only) is enforced by `requireAdmin`, not here. */
export async function grantRole(
  db: Kysely<Database>,
  targetVoterId: string,
  role: 'moderator' | 'admin',
  granted: boolean,
): Promise<GrantRoleOutcome> {
  const voter = await setVoterRole(db, targetVoterId, role, granted);
  return voter ? { kind: 'ok', value: voter } : { kind: 'notFound' };
}
