import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import { isVoterBannedLockingShared } from '../auth/votersRepository.js';
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

/** The Voter was banned before this vote could be recorded (spec §6.7); nothing was written. */
export interface BannedVoter {
  banned: true;
}

/**
 * Casts a vote and increments both denormalised counters in one transaction
 * (war-spec.md §6.3). The transaction first takes a shared lock on the
 * Voter's row and refuses a banned Voter: a ban's write to that row waits for
 * this transaction (so the ban's purge then deletes the vote), and a vote
 * arriving after an uncommitted ban waits for it and then sees the ban. The insert is `ON CONFLICT DO NOTHING` against the
 * `UNIQUE (matchup_id, voter_id)` constraint, which is the real arbiter when
 * two requests for the same voter race — the caller's pre-check is only a
 * fast path, not the source of truth. When the insert is skipped, the
 * counters are **not** touched, so the losing request never
 * double-increments them; it returns the row the winner (or an earlier
 * vote) already wrote.
 */
export async function castVote(
  db: Kysely<Database>,
  matchup: Matchup,
  voterId: string,
  winnerId: string,
  presentedLeftId: string,
): Promise<CastVoteResult | BannedVoter> {
  return db.transaction().execute(async (trx) => {
    if (await isVoterBannedLockingShared(trx, voterId)) return { banned: true };

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

/** Deletes every vote `voterId` cast (spec §6.7: a ban removes them) and returns the ids of the Wars they were cast in, whose counters need recomputing. */
export async function deleteVotesByVoter(db: Kysely<Database>, voterId: string): Promise<string[]> {
  const deleted = await db.deleteFrom('votes').where('voter_id', '=', voterId).returning('matchup_id').execute();
  if (deleted.length === 0) return [];
  const matchups = await db
    .selectFrom('matchups')
    .select('war_id')
    .where('id', 'in', deleted.map((row) => row.matchup_id))
    .execute();
  return [...new Set(matchups.map((row) => row.war_id))];
}
