import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { MutationOutcome, NotFound } from '../shared/outcomes.js';
import { logAction } from '../moderation/moderationLogRepository.js';
import { deleteMediaForContestants } from '../contestants/contestantMediaRepository.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { markWarRemoved } from './warsRepository.js';
import { deleteMediaObjects, mediaPrefixes } from './warMediaStorage.js';

export type RemoveWarOutcome = MutationOutcome<void, NotFound>;

/**
 * Removes a War (§6.7): hidden from everyone, rows kept for the audit
 * trail, media hard-deleted. Staff-only access is enforced by the route's
 * guard. The removal, the `contestant_media` deletion and the moderation log
 * entry commit together or not at all; the stored objects are deleted only
 * after that commit.
 */
export async function removeWar(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  staffVoterId: string,
  warId: string,
): Promise<RemoveWarOutcome> {
  const prefixes = await db.transaction().execute(async (trx): Promise<string[] | undefined> => {
    if (!(await markWarRemoved(trx, warId))) return undefined;
    const contestantIds = (await listContestantsByWar(trx, warId)).map((contestant) => contestant.id);
    await deleteMediaForContestants(trx, contestantIds);
    await logAction(trx, { action: 'remove_war', staffVoterId, targetWarId: warId });
    return mediaPrefixes(warId, contestantIds);
  });
  if (!prefixes) return { kind: 'notFound' };

  await deleteMediaObjects(storage, log, prefixes, { warId });
  return { kind: 'ok', value: undefined };
}
