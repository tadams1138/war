import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { MutationOutcome, NotFound } from '../shared/outcomes.js';
import { logAction } from '../moderation/moderationLogRepository.js';
import { deleteMediaForContestants } from '../contestants/contestantMediaRepository.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { markWarRemoved } from './warsRepository.js';

export type RemoveWarOutcome = MutationOutcome<void, NotFound>;

/** Every storage prefix holding this War's media (key layout: `imageUploadService.ts`, `setShareImage` in `warsService.ts`). */
function mediaPrefixes(warId: string, contestantIds: string[]): string[] {
  return [
    ...contestantIds.flatMap((id) => [`contestants/${id}/`, `originals/${id}/`]),
    `share-images/${warId}.`,
    `originals/share-images/${warId}.`,
  ];
}

/**
 * Removes a War (spec §6.7): hidden from everyone, rows kept for the audit
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

  await deleteMediaObjects(storage, log, warId, prefixes);
  return { kind: 'ok', value: undefined };
}

/** Best effort: the War is already removed, so a storage failure is logged (leaving orphaned objects) rather than failing the request. */
async function deleteMediaObjects(storage: ObjectStorage, log: FastifyBaseLogger, warId: string, prefixes: string[]): Promise<void> {
  try {
    for (const prefix of prefixes) {
      await storage.deletePrefix(prefix);
    }
  } catch (err) {
    log.error({ err, warId }, 'failed to delete a removed War\'s media objects from storage');
  }
}
