import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { revokeAllForVoter } from '../auth/refreshTokensRepository.js';
import { listContestantsByWar, recomputeContestantCounters } from '../contestants/contestantsRepository.js';
import { deleteWarRowIn, listWarIdsByCreator } from '../wars/warsRepository.js';
import { deleteVotesByVoter } from '../votes/votesRepository.js';
import { mediaPrefixes } from '../wars/warMediaStorage.js';

/**
 * Ends a banned Voter's sessions and hard-deletes what they created or cast (spec §6.7), on the ban's own
 * transaction. Returns the storage prefixes of the deleted Wars' media, for
 * the caller to delete from the object store once the transaction commits.
 */
export async function purgeBannedVoterData(trx: Kysely<Database>, voterId: string): Promise<string[]> {
  const prefixes: string[] = [];
  for (const warId of await listWarIdsByCreator(trx, voterId)) {
    const contestantIds = (await listContestantsByWar(trx, warId)).map((contestant) => contestant.id);
    await deleteWarRowIn(trx, warId);
    prefixes.push(...mediaPrefixes(warId, contestantIds));
  }
  for (const warId of await deleteVotesByVoter(trx, voterId)) {
    await recomputeContestantCounters(trx, warId);
  }
  await revokeAllForVoter(trx, voterId);
  await trx.deleteFrom('war_memberships').where('voter_id', '=', voterId).execute();
  return prefixes;
}
