import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import type { Matchup } from '../matchups/matchupsRepository.js';

export interface Vote {
  id: string;
  matchupId: string;
  voterId: string;
  winnerId: string;
  presentedLeftId: string;
}

function toVote(row: {
  id: string;
  matchup_id: string;
  voter_id: string;
  winner_id: string;
  presented_left_id: string;
}): Vote {
  return {
    id: row.id,
    matchupId: row.matchup_id,
    voterId: row.voter_id,
    winnerId: row.winner_id,
    presentedLeftId: row.presented_left_id,
  };
}

/** Deletes every vote cast on any of the given matchups (contestant removal, spec §6.1: "clears those votes... scoped to that contestant's own matchups only"). */
export async function deleteVotesForMatchups(db: Kysely<Database>, matchupIds: string[]): Promise<void> {
  if (matchupIds.length === 0) return;
  await db.deleteFrom('votes').where('matchup_id', 'in', matchupIds).execute();
}

/** Deletes every vote cast anywhere in a War (Clear Votes, spec §6.1: "deletes every vote cast in the War"). */
export async function deleteVotesForWar(db: Kysely<Database>, warId: string): Promise<void> {
  await db
    .deleteFrom('votes')
    .where('matchup_id', 'in', (eb) => eb.selectFrom('matchups').select('id').where('war_id', '=', warId))
    .execute();
}

export async function findVote(db: Kysely<Database>, matchupId: string, voterId: string): Promise<Vote | undefined> {
  const row = await db
    .selectFrom('votes')
    .selectAll()
    .where('matchup_id', '=', matchupId)
    .where('voter_id', '=', voterId)
    .executeTakeFirst();
  return row ? toVote(row) : undefined;
}

export interface CastVoteResult {
  /** False when a concurrent insert for this (matchup, voter) won the race. */
  inserted: boolean;
  vote: Vote;
}

/**
 * Casts a vote and increments both denormalised counters in one transaction
 * (spec). The insert is `ON CONFLICT DO NOTHING` against the
 * `UNIQUE (matchup_id, voter_id)` constraint, which is the real arbiter when
 * two requests for the same voter race (design review finding 2) — the
 * caller's pre-check (spec) is only a fast path, not the source of
 * truth. When the insert is skipped, the counters are **not** touched, so
 * the losing request never double-increments them; it returns the row the
 * winner (or an earlier vote) already wrote.
 */
export async function castVote(
  db: Kysely<Database>,
  matchup: Matchup,
  voterId: string,
  winnerId: string,
  presentedLeftId: string,
): Promise<CastVoteResult> {
  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('votes')
      .values({
        id: newId(),
        matchup_id: matchup.id,
        voter_id: voterId,
        winner_id: winnerId,
        presented_left_id: presentedLeftId,
      })
      .onConflict((oc) => oc.columns(['matchup_id', 'voter_id']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (!inserted) {
      const existing = await trx
        .selectFrom('votes')
        .selectAll()
        .where('matchup_id', '=', matchup.id)
        .where('voter_id', '=', voterId)
        .executeTakeFirstOrThrow();
      return { inserted: false, vote: toVote(existing) };
    }

    await trx
      .updateTable('contestants')
      .set((eb) => ({ win_count: eb('win_count', '+', 1) }))
      .where('id', '=', winnerId)
      .execute();

    await trx
      .updateTable('contestants')
      .set((eb) => ({ appearance_count: eb('appearance_count', '+', 1) }))
      .where('id', 'in', [matchup.contestantAId, matchup.contestantBId])
      .execute();

    return { inserted: true, vote: toVote(inserted) };
  });
}
