import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, MatchupsTable } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface Matchup {
  id: string;
  warId: string;
  contestantAId: string;
  contestantBId: string;
}

/** The four matchup columns `findUnvotedMatchupsForVoter`'s joined query
 * selects explicitly, picked from `Selectable<MatchupsTable>` rather than
 * hand-declared, so the column list can't drift from `db/types.ts`. */
type MatchupColumns = Pick<Selectable<MatchupsTable>, 'id' | 'war_id' | 'contestant_a_id' | 'contestant_b_id'>;

function toMatchup(row: MatchupColumns): Matchup {
  return { id: row.id, warId: row.war_id, contestantAId: row.contestant_a_id, contestantBId: row.contestant_b_id };
}

/**
 * Generates matchups for one newly-added contestant against every
 * contestant already on the roster (spec §4 "Matchup": "generated the
 * moment it's added, against every other contestant present at that time").
 * Not a re-run of a bulk pairwise generator over the whole roster -- that
 * would try to recreate every existing pair too and collide with the
 * canonical-ordering unique constraint.
 */
export async function generateMatchupsForNewContestant(
  db: Kysely<Database>,
  warId: string,
  newContestantId: string,
  existingContestantIds: string[],
): Promise<number> {
  if (existingContestantIds.length === 0) {
    return 0;
  }

  const rows = existingContestantIds.map((otherId) => {
    const [a, b] = [newContestantId, otherId].sort();
    return { id: newId(), war_id: warId, contestant_a_id: a!, contestant_b_id: b! };
  });

  await db.insertInto('matchups').values(rows).execute();
  return rows.length;
}

/** Every matchup id involving `contestantId`, needed to clean up its votes and matchups before it's removed (spec §6.1). */
export async function findMatchupIdsForContestant(db: Kysely<Database>, warId: string, contestantId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('matchups')
    .select('id')
    .where('war_id', '=', warId)
    .where((eb) => eb.or([eb('contestant_a_id', '=', contestantId), eb('contestant_b_id', '=', contestantId)]))
    .execute();
  return rows.map((row) => row.id);
}

export async function deleteMatchupsByIds(db: Kysely<Database>, matchupIds: string[]): Promise<void> {
  if (matchupIds.length === 0) return;
  await db.deleteFrom('matchups').where('id', 'in', matchupIds).execute();
}

export async function countMatchupsForWar(db: Kysely<Database>, warId: string): Promise<number> {
  const row = await db
    .selectFrom('matchups')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('war_id', '=', warId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export async function findMatchupById(db: Kysely<Database>, id: string): Promise<Matchup | undefined> {
  const row = await db.selectFrom('matchups').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toMatchup(row) : undefined;
}

/**
 * Every pair the voter has not yet voted on, ordered by lowest combined
 * appearance_count with ties broken by a stable per-voter shuffle (spec)
 * — the first row is the voter's next matchup; further rows compute
 * the prefetch block. The `md5(...)` tie-break here is the SQL twin of
 * `stableHash` in `src/matchups/stableHash.ts`, which mirrors this exact
 * expression so tests can predict the order without hitting the database;
 * change the two together.
 */
export async function findUnvotedMatchupsForVoter(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  limit: number,
): Promise<Matchup[]> {
  const rows = await db
    .selectFrom('matchups as m')
    .innerJoin('contestants as ca', 'ca.id', 'm.contestant_a_id')
    .innerJoin('contestants as cb', 'cb.id', 'm.contestant_b_id')
    .select(['m.id as id', 'm.war_id as war_id', 'm.contestant_a_id as contestant_a_id', 'm.contestant_b_id as contestant_b_id'])
    .where('m.war_id', '=', warId)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('votes as v')
            .select('v.id')
            .whereRef('v.matchup_id', '=', 'm.id')
            .where('v.voter_id', '=', voterId),
        ),
      ),
    )
    .orderBy(sql`(ca.appearance_count + cb.appearance_count)`, 'asc')
    .orderBy(sql`md5(m.id::text || ${voterId}::text)`, 'asc')
    .limit(limit)
    .execute();

  return rows.map((row) => toMatchup(row));
}

export async function countVotesByVoterInWar(db: Kysely<Database>, warId: string, voterId: string): Promise<number> {
  const row = await db
    .selectFrom('votes as v')
    .innerJoin('matchups as m', 'm.id', 'v.matchup_id')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('m.war_id', '=', warId)
    .where('v.voter_id', '=', voterId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
