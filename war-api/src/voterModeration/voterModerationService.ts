import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { Forbidden, MutationOutcome, NotFound } from '../shared/outcomes.js';
import { findVoterByIdForUpdate, setVoterBanned, setVoterSuspended, type Voter } from '../auth/votersRepository.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { deleteMediaObjects } from '../wars/warMediaStorage.js';
import { purgeBannedVoterData } from './banPurge.js';
import { logAction } from '../moderation/moderationLogRepository.js';

export type ChangeSuspensionOutcome = MutationOutcome<Voter, NotFound | Forbidden>;

/**
 * Looks up the target of a Staff moderation action (§6.7). Staff (and so
 * the caller themself) can never be a target: a Moderator or Admin must have
 * their role revoked by an Admin first. The target's row is locked (`FOR UPDATE`)
 * until the caller's transaction ends, so a concurrent role grant (whose UPDATE
 * needs the same row) cannot slip in between this check and the write, and a
 * vote holding a shared lock on the row finishes before a ban's purge begins.
 * It is the ban transaction's first statement, ahead of the purge.
 */
async function findModerationTarget(
  db: Kysely<Database>,
  staffVoterId: string,
  targetVoterId: string,
): Promise<{ kind: 'ok'; value: Voter } | NotFound | Forbidden> {
  const target = await findVoterByIdForUpdate(db, targetVoterId);
  if (!target) return { kind: 'notFound' };
  if (target.id === staffVoterId || target.isModerator || target.isAdmin) return { kind: 'forbidden' };
  return { kind: 'ok', value: target };
}

/**
 * Suspends or unsuspends a Voter (§6.7). Staff-only access is enforced
 * by the route's guard. The state change and its moderation log entry commit
 * together or not at all.
 */
export async function changeSuspension(
  db: Kysely<Database>,
  staffVoterId: string,
  targetVoterId: string,
  suspended: boolean,
): Promise<ChangeSuspensionOutcome> {
  return db.transaction().execute(async (trx): Promise<ChangeSuspensionOutcome> => {
    const target = await findModerationTarget(trx, staffVoterId, targetVoterId);
    if (target.kind !== 'ok') return target;
    const voter = await setVoterSuspended(trx, targetVoterId, suspended);
    await logAction(trx, { action: suspended ? 'suspend_voter' : 'unsuspend_voter', staffVoterId, targetVoterId });
    return { kind: 'ok', value: voter! };
  });
}

export type ChangeBanOutcome = MutationOutcome<Voter, NotFound | Forbidden>;

/**
 * Bans or unbans a Voter (§6.7). Banning also hard-deletes what the
 * Voter created. The state change, the deletions and the moderation log entry
 * commit together or not at all; the stored media objects are deleted only
 * after that commit, best effort.
 */
export async function changeBan(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  staffVoterId: string,
  targetVoterId: string,
  banned: boolean,
): Promise<ChangeBanOutcome> {
  const result = await db.transaction().execute(async (trx): Promise<{ outcome: ChangeBanOutcome; prefixes: string[] }> => {
    const target = await findModerationTarget(trx, staffVoterId, targetVoterId);
    if (target.kind !== 'ok') return { outcome: target, prefixes: [] };
    const voter = await setVoterBanned(trx, targetVoterId, banned);
    const prefixes = banned ? await purgeBannedVoterData(trx, targetVoterId) : [];
    await logAction(trx, { action: banned ? 'ban_voter' : 'unban_voter', staffVoterId, targetVoterId });
    return { outcome: { kind: 'ok', value: voter! }, prefixes };
  });

  await deleteMediaObjects(storage, log, result.prefixes, { voterId: targetVoterId });
  return result.outcome;
}
