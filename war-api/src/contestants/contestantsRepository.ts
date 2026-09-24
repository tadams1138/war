import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { ContestantsTable, Database } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface Contestant {
  id: string;
  warId: string;
  name: string;
  bio: string | null;
  winCount: number;
  appearanceCount: number;
}

function toContestant(row: Selectable<ContestantsTable>): Contestant {
  return {
    id: row.id,
    warId: row.war_id,
    name: row.name,
    bio: row.bio,
    winCount: row.win_count,
    appearanceCount: row.appearance_count,
  };
}

export interface CreateContestantInput {
  warId: string;
  name: string;
  bio: string | null;
}

export async function createContestant(db: Kysely<Database>, input: CreateContestantInput): Promise<Contestant> {
  const row = await db
    .insertInto('contestants')
    .values({
      id: newId(),
      war_id: input.warId,
      name: input.name,
      bio: input.bio,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toContestant(row);
}

export async function findContestantById(db: Kysely<Database>, id: string): Promise<Contestant | undefined> {
  const row = await db.selectFrom('contestants').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toContestant(row) : undefined;
}

/**
 * Batches a lookup of many contestants by id into one query — the
 * alternative of one `findContestantById` call per id is what
 * `/matchups/next` would otherwise pay for its current pair and prefetch
 * pair.
 */
export async function findContestantsByIds(db: Kysely<Database>, ids: string[]): Promise<Map<string, Contestant>> {
  const byId = new Map<string, Contestant>();
  if (ids.length === 0) {
    return byId;
  }
  const rows = await db.selectFrom('contestants').selectAll().where('id', 'in', ids).execute();
  for (const row of rows) {
    const contestant = toContestant(row);
    byId.set(contestant.id, contestant);
  }
  return byId;
}

export async function listContestantsByWar(db: Kysely<Database>, warId: string): Promise<Contestant[]> {
  const rows = await db
    .selectFrom('contestants')
    .selectAll()
    .where('war_id', '=', warId)
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map((row) => toContestant(row));
}

/**
 * Batches each War's contestant count into one query, keyed by War id (spec
 * the spec's `contestant_count` on `WarSummary`) -- mirrors
 * `listMediaByContestants`'s batching pattern above for the same N+1 reason
 * a page of Wars would otherwise pay. Counts every `contestants` row
 * regardless of status (there is none to filter on), so a `draft` War's
 * full contestant count is reported, not zero.
 */
export async function countContestantsByWarIds(db: Kysely<Database>, warIds: string[]): Promise<Map<string, number>> {
  const byWar = new Map<string, number>();
  if (warIds.length === 0) {
    return byWar;
  }
  const rows = await db
    .selectFrom('contestants')
    .select(['war_id', (eb) => eb.fn.countAll<string>().as('count')])
    .where('war_id', 'in', warIds)
    .groupBy('war_id')
    .execute();
  for (const row of rows) {
    byWar.set(row.war_id, Number(row.count));
  }
  return byWar;
}

/** Single-War convenience over `countContestantsByWarIds` -- one query shape, two call shapes. */
export async function countContestantsForWar(db: Kysely<Database>, warId: string): Promise<number> {
  return (await countContestantsByWarIds(db, [warId])).get(warId) ?? 0;
}

export interface ContestantPatch {
  name?: string;
  bio?: string | null;
}

export async function updateContestant(db: Kysely<Database>, id: string, patch: ContestantPatch): Promise<Contestant> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.bio !== undefined) values.bio = patch.bio;

  const row = await db
    .updateTable('contestants')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toContestant(row);
}

/** Removes a contestant's own media rows first -- the FK from `contestant_media` to `contestants` has no cascade,
 *  so deleting a contestant with any image would otherwise violate it. Matches `deleteWarRow`'s own precedent of
 *  leaving the underlying storage objects in place rather than reaching into the object store. */
export async function deleteContestant(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('contestant_media').where('contestant_id', '=', id).execute();
  await db.deleteFrom('contestants').where('id', '=', id).execute();
}

/**
 * Recomputes every contestant's `win_count`/`appearance_count` in a War from
 * the votes/matchups that actually remain (spec §4 "Vote": normally
 * maintained incrementally alongside each vote insert, but a bulk vote
 * deletion -- Clear Votes, or removing a contestant that carries votes,
 * §6.1 -- needs the survivors' counters corrected afterward). A
 * `COUNT(*)`-based aggregate write, not hand-rolled decrement math: recompute
 * from source of truth rather than risk a subtle delta bug in vote-count
 * integrity.
 */
export async function recomputeContestantCounters(db: Kysely<Database>, warId: string): Promise<void> {
  await sql`
    UPDATE contestants c SET
      win_count = COALESCE((SELECT COUNT(*) FROM votes v JOIN matchups m ON m.id = v.matchup_id WHERE m.war_id = c.war_id AND v.winner_id = c.id), 0),
      appearance_count = COALESCE((SELECT COUNT(*) FROM votes v JOIN matchups m ON m.id = v.matchup_id WHERE m.war_id = c.war_id AND (m.contestant_a_id = c.id OR m.contestant_b_id = c.id)), 0)
    WHERE c.war_id = ${warId}
  `.execute(db);
}
