import type { Kysely, Selectable } from 'kysely';
import type { Database, WarsTable } from '../db/types.js';
import { toJsonb } from '../db/jsonb.js';
import { newId } from '../db/uuid.js';
import type { ContestantSchemaField } from '../contestants/schemaValidation.js';

export interface War {
  id: string;
  creatorId: string | null;
  title: string | null;
  category: string | null;
  status: string;
  visibility: string;
  mediaMode: string;
  theme: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
  shareImageKey: string | null;
  createdAt: Date;
}

function toWar(row: Selectable<WarsTable>): War {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    mediaMode: row.media_mode,
    theme: row.theme,
    contestantSchema: (row.contestant_schema ?? []) as ContestantSchemaField[],
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    shareImageKey: row.share_image_key,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateWarInput {
  creatorId: string;
  title: string | null;
  category: string | null;
  visibility: string;
  mediaMode: string;
  theme: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
}

export async function createWar(db: Kysely<Database>, input: CreateWarInput): Promise<War> {
  const row = await db
    .insertInto('wars')
    .values({
      id: newId(),
      creator_id: input.creatorId,
      title: input.title,
      category: input.category,
      status: 'draft',
      visibility: input.visibility,
      media_mode: input.mediaMode,
      theme: input.theme,
      contestant_schema: toJsonb(input.contestantSchema),
      ends_at: input.endsAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

export async function findWarById(db: Kysely<Database>, id: string): Promise<War | undefined> {
  const row = await db.selectFrom('wars').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toWar(row) : undefined;
}

export interface ListWarsFilter {
  status?: string;
  category?: string;
  cursor?: string;
  limit: number;
  /**
   * Scopes the list to Wars created by this voter, across every status --
   * including their own drafts and invite-only Wars (spec,
   * "Addendum (2026-09-01)"). Composes with `status`/`category` exactly as
   * those two already compose with each other. Only ever set from the
   * authenticated requester's own id -- never from a client-supplied one --
   * so this is the one filter here that can surface a voter's private Wars.
   */
  creatorId?: string;
}

/**
 * The ownership-scoping decision (own Wars, every status, vs. the default
 * public/active scoping), extracted purely to keep `listWars`'s own branch
 * count down -- it's one cohesive rule, not several independent filters,
 * and reads better as its own named step. Builds the base query itself so
 * its return type is inferred from actual `.where()` usage rather than
 * needing to be spelled out generically.
 */
function baseWarsQuery(db: Kysely<Database>, filter: ListWarsFilter) {
  const query = db.selectFrom('wars').selectAll().orderBy('created_at', 'desc').orderBy('id', 'desc');

  if (filter.creatorId) {
    const ownScoped = query.where('creator_id', '=', filter.creatorId);
    return filter.status ? ownScoped.where('status', '=', filter.status) : ownScoped;
  }
  // Default visibility/status scoping, applied whenever `creatorId` is
  // absent (spec, "Default scoping (no `creator=me`)"): never a
  // `draft` War, never an `invite_only` one, regardless of any `status`
  // filter supplied -- `status=draft` returns empty rather than another
  // voter's drafts, since `status != 'draft'` and `status = 'draft'` can
  // never both hold. Omitting `status` entirely defaults to `active`.
  // This is the one place that rule is enforced; every caller of
  // `listWars` inherits it, so a future caller cannot bypass it by
  // forgetting to ask.
  return query
    .where('status', '=', filter.status ?? 'active')
    .where('status', '!=', 'draft')
    .where('visibility', '!=', 'invite_only');
}

export async function listWars(db: Kysely<Database>, filter: ListWarsFilter): Promise<War[]> {
  let query = baseWarsQuery(db, filter);

  if (filter.category) {
    query = query.where('category', '=', filter.category);
  }
  if (filter.cursor) {
    query = query.where('id', '<', filter.cursor);
  }

  const rows = await query.limit(filter.limit).execute();
  return rows.map((row) => toWar(row));
}

export interface WarPatch {
  title?: string;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
  contestantSchema?: ContestantSchemaField[];
  endsAt?: Date | null;
}

/**
 * One `[patch key, column, transform]` entry per updatable column, applied
 * uniformly in a loop -- keeps `updateWar` itself at zero branches instead
 * of one `if` per field, and adding a column is a new row here rather than
 * another `if`.
 */
const WAR_PATCH_COLUMNS: {
  [K in keyof WarPatch]-?: { column: string; transform: (value: NonNullable<WarPatch[K]>) => unknown };
} = {
  title: { column: 'title', transform: (value) => value },
  category: { column: 'category', transform: (value) => value },
  visibility: { column: 'visibility', transform: (value) => value },
  mediaMode: { column: 'media_mode', transform: (value) => value },
  theme: { column: 'theme', transform: (value) => value },
  contestantSchema: { column: 'contestant_schema', transform: (value) => toJsonb(value) },
  endsAt: { column: 'ends_at', transform: (value) => value },
};

function warPatchValues(patch: WarPatch): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(WAR_PATCH_COLUMNS) as (keyof WarPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    const { column, transform } = WAR_PATCH_COLUMNS[key];
    values[column] = (transform as (value: unknown) => unknown)(value);
  }
  return values;
}

export async function updateWar(db: Kysely<Database>, id: string, patch: WarPatch): Promise<War> {
  const values = warPatchValues(patch);

  const row = await db
    .updateTable('wars')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

export async function setWarStatus(db: Kysely<Database>, id: string, status: string): Promise<War> {
  const row = await db
    .updateTable('wars')
    .set({ status })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

export async function setWarShareImageKey(db: Kysely<Database>, id: string, shareImageKey: string | null): Promise<War> {
  const row = await db
    .updateTable('wars')
    .set({ share_image_key: shareImageKey })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

/** Materialises stored status for expired Wars (spec). Idempotent. */
export async function closeExpiredWars(db: Kysely<Database>, now: Date): Promise<number> {
  const rows = await db
    .updateTable('wars')
    .set({ status: 'closed' })
    .where('status', '=', 'active')
    .where('ends_at', 'is not', null)
    .where('ends_at', '<=', now)
    .returning('id')
    .execute();
  return rows.length;
}

/**
 * Removes a draft War and its contestants (`deleteWar` in `warsService.ts`
 * only ever calls this once `loadDraftWarOwnedBy` has confirmed draft
 * status, so there are never matchups, votes, or memberships to clean up --
 * those only exist from activation onward). Contestant media rows go first,
 * matching `deleteContestant`'s own precedent of leaving the underlying
 * storage objects in place rather than reaching into the object store.
 */
export async function deleteWarRow(db: Kysely<Database>, warId: string): Promise<void> {
  const contestantIds = await db.selectFrom('contestants').select('id').where('war_id', '=', warId).execute();
  if (contestantIds.length > 0) {
    await db
      .deleteFrom('contestant_media')
      .where(
        'contestant_id',
        'in',
        contestantIds.map((row) => row.id),
      )
      .execute();
  }
  await db.deleteFrom('contestants').where('war_id', '=', warId).execute();
  await db.deleteFrom('wars').where('id', '=', warId).execute();
}

export async function createMembership(db: Kysely<Database>, warId: string, voterId: string): Promise<void> {
  await db
    .insertInto('war_memberships')
    .values({ war_id: warId, voter_id: voterId })
    .onConflict((oc) => oc.columns(['war_id', 'voter_id']).doNothing())
    .execute();
}

export async function isMember(db: Kysely<Database>, warId: string, voterId: string): Promise<boolean> {
  const row = await db
    .selectFrom('war_memberships')
    .select('war_id')
    .where('war_id', '=', warId)
    .where('voter_id', '=', voterId)
    .executeTakeFirst();
  return row !== undefined;
}
