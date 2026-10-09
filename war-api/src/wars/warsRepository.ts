import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, WarsTable } from '../db/types.js';
import { isUuid, newId } from '../db/uuid.js';
import { createdAtText } from '../shared/keysetCursor.js';
import { containsPattern } from '../shared/likePattern.js';
import { hasEffectiveStatus } from './effectiveStatusSql.js';
import { deleteReportsForWar } from '../reports/reportsRepository.js';

export interface War {
  id: string;
  creatorId: string | null;
  title: string | null;
  category: string | null;
  status: string;
  visibility: string;
  mediaMode: string;
  theme: string;
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
      ends_at: input.endsAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}

export async function findWarById(db: Kysely<Database>, id: string): Promise<War | undefined> {
  const row = await db.selectFrom('wars').selectAll().where('id', '=', id).where('removed_at', 'is', null).executeTakeFirst();
  return row ? toWar(row) : undefined;
}

/** Marks a not-yet-removed War removed (§6.7). `false` if it doesn't exist or was already removed. */
export async function markWarRemoved(db: Kysely<Database>, id: string): Promise<boolean> {
  const row = await db
    .updateTable('wars')
    .set({ removed_at: sql<Date>`now()`, share_image_key: null })
    .where('id', '=', id)
    .where('removed_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

export type WarsSort = 'newest' | 'oldest' | 'alphabetical' | 'expiring_soonest';

export interface ListWarsFilter {
  status?: string;
  category?: string;
  cursor?: string;
  limit: number;
  /** The instant status filters are evaluated at -- a War ending at or before it is closed (§4, "Effective status"). */
  now: Date;
  /**
   * Scopes the list to Wars created by this voter, across every status --
   * including their own drafts and invite-only Wars (§6.1).
   * Composes with `status`/`category` exactly as
   * those two already compose with each other. Only ever set from the
   * authenticated requester's own id -- never from a client-supplied one --
   * so this is the one filter here that can surface a voter's private Wars.
   */
  creatorId?: string;
  /** Defaults to `'newest'`. */
  sort?: WarsSort;
  /** Case-insensitive substring match against `title` or the creator's `display_name`. */
  q?: string;
}

export interface WarWithCreatorName extends War {
  creatorName: string | null;
}

export type ListWarsOutcome =
  | { kind: 'ok'; wars: WarWithCreatorName[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };

type WarRow = Selectable<WarsTable>;
/** Carries the sort keys as the database's own microsecond-precision UTC text, so a cursor never truncates them to a JS Date's milliseconds. */
type WarRowWithCreatorName = WarRow & { creator_name: string | null; created_at_text: string; ends_at_text: string | null };

function toWarWithCreatorName(row: WarRowWithCreatorName): WarWithCreatorName {
  return { ...toWar(row), creatorName: row.creator_name };
}

/**
 * The base `listWars` query with the ownership scope applied (own Wars in every status, or the default public
 * scoping). LEFT-joins `voters` (`creator_id` can be null) so `q` can match the creator's display name and the
 * listing can report `creator_name` in the same query.
 */
function baseWarsQuery(db: Kysely<Database>, filter: ListWarsFilter) {
  const query = db
    .selectFrom('wars')
    .leftJoin('voters', 'voters.id', 'wars.creator_id')
    .selectAll('wars')
    .select((eb) => eb.ref('voters.display_name').as('creator_name'))
    .select(createdAtText('wars.created_at').as('created_at_text'))
    .select(createdAtText('wars.ends_at').as('ends_at_text'))
    .where('wars.removed_at', 'is', null);

  if (filter.creatorId) {
    const ownScoped = query.where('wars.creator_id', '=', filter.creatorId);
    return filter.status ? ownScoped.where(hasEffectiveStatus(filter.status, filter.now)) : ownScoped;
  }
  // Default scoping when `creatorId` is absent (§6.1): never a draft, never an invite-only War, whatever
  // `status` asks for (`status=draft` returns empty, not another voter's drafts). No `status` means `published`.
  // Enforced here so every caller of `listWars` inherits it.
  return query
    .where(hasEffectiveStatus(filter.status ?? 'published', filter.now))
    .where('wars.status', '!=', 'draft')
    .where('wars.visibility', '!=', 'invite_only');
}

type WarsQuery = ReturnType<typeof baseWarsQuery>;

/**
 * Case-insensitive substring match against `wars.title` OR the creator's
 * `voters.display_name`. A null or whitespace-only title never
 * matches on the title side (an empty-looking title has nothing meaningful
 * to search), but creator-name matching is unaffected either way.
 */
function applySearch(query: WarsQuery, q: string | undefined): WarsQuery {
  if (!q) return query;
  const pattern = containsPattern(q);
  return query.where(
    () =>
      sql<boolean>`((wars.title IS NOT NULL AND trim(wars.title) != '' AND wars.title ILIKE ${pattern}) OR wars.creator_id = any(array(select id from voters where display_name ilike ${pattern})))`,
  );
}

function orderNewest(query: WarsQuery): WarsQuery {
  return query.orderBy('wars.created_at', 'desc').orderBy('wars.id', 'desc');
}

function orderOldest(query: WarsQuery): WarsQuery {
  return query.orderBy('wars.created_at', 'asc').orderBy('wars.id', 'asc');
}

/**
 * `ORDER BY (col IS NULL) ASC, COALESCE(col, sentinel) ASC, id ASC` --
 * `(col IS NULL)` is a boolean, never itself NULL, so it always sorts every
 * non-null row before every null one; the coalesced value only breaks ties
 * within the non-null group, and `id` is the final tiebreaker in both
 * groups. See `wars-list-sorting.feature` for the boundary case this exists
 * to get right.
 */
function orderAlphabetical(query: WarsQuery): WarsQuery {
  return query
    .orderBy(sql`(wars.title IS NULL)`, 'asc')
    .orderBy(sql`COALESCE(wars.title, '')`, 'asc')
    .orderBy('wars.id', 'asc');
}

/** A War with no end date never "expires", so it sorts after every War that has one -- see `orderAlphabetical`'s comment for the general pattern. */
const EXPIRES_SENTINEL = '9999-12-31T00:00:00.000Z';

function orderExpiringSoonest(query: WarsQuery): WarsQuery {
  return query
    .orderBy(sql`(wars.ends_at IS NULL)`, 'asc')
    .orderBy(sql`COALESCE(wars.ends_at, ${EXPIRES_SENTINEL}::timestamptz)`, 'asc')
    .orderBy('wars.id', 'asc');
}

const ORDER_APPLIERS: Record<WarsSort, (query: WarsQuery) => WarsQuery> = {
  newest: orderNewest,
  oldest: orderOldest,
  alphabetical: orderAlphabetical,
  expiring_soonest: orderExpiringSoonest,
};

interface Cursor {
  sort: WarsSort;
  /** The sort key's value, as a string, or `null` when it was itself null (only meaningful for the two nullable-sort-key modes). */
  v: string | null;
  isNull: boolean;
  id: string;
}

function cursorNewest(query: WarsQuery, cursor: Cursor): WarsQuery {
  return query.where(() => sql<boolean>`(wars.created_at, wars.id) < (${cursor.v}::timestamptz, ${cursor.id}::uuid)`);
}

function cursorOldest(query: WarsQuery, cursor: Cursor): WarsQuery {
  return query.where(() => sql<boolean>`(wars.created_at, wars.id) > (${cursor.v}::timestamptz, ${cursor.id}::uuid)`);
}

function cursorAlphabetical(query: WarsQuery, cursor: Cursor): WarsQuery {
  return query.where(
    () =>
      sql<boolean>`(wars.title IS NULL, COALESCE(wars.title, ''), wars.id) > (${cursor.isNull}, ${cursor.v ?? ''}, ${cursor.id}::uuid)`,
  );
}

function cursorExpiringSoonest(query: WarsQuery, cursor: Cursor): WarsQuery {
  const value = cursor.v ?? EXPIRES_SENTINEL;
  return query.where(
    () =>
      sql<boolean>`(wars.ends_at IS NULL, COALESCE(wars.ends_at, ${EXPIRES_SENTINEL}::timestamptz), wars.id) > (${cursor.isNull}, ${value}::timestamptz, ${cursor.id}::uuid)`,
  );
}

const CURSOR_APPLIERS: Record<WarsSort, (query: WarsQuery, cursor: Cursor) => WarsQuery> = {
  newest: cursorNewest,
  oldest: cursorOldest,
  alphabetical: cursorAlphabetical,
  expiring_soonest: cursorExpiringSoonest,
};

function isValidTimestamp(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

/** `newest`/`oldest` sort on `created_at`, which is never null, so their cursor value must be a real timestamp; the other two may legitimately be null. */
function isValidCursorValue(sort: WarsSort, v: unknown): boolean {
  if (sort === 'alphabetical') return v === null || typeof v === 'string';
  if (v === null) return sort === 'expiring_soonest';
  return typeof v === 'string' && isValidTimestamp(v);
}

function isCursorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasValidCursorFields(value: Record<string, unknown>, sort: WarsSort): boolean {
  if (value.sort !== sort) return false;
  if (!isUuid(value.id)) return false;
  if (typeof value.isNull !== 'boolean') return false;
  return isValidCursorValue(sort, value.v);
}

type DecodedCursor = { kind: 'ok'; cursor: Cursor } | { kind: 'invalid' };

/**
 * Decodes an opaque, base64-encoded JSON cursor. Rejects anything
 * malformed, or produced under a different `sort` than the one it is now
 * being replayed against -- the keyset predicate for one sort mode is
 * meaningless (and, for a mismatched nullable column, unsafe) against
 * another's ordering. Never lets an unvalidated value reach the database:
 * every field a query below interpolates is checked here first.
 */
function decodeCursor(raw: string, sort: WarsSort): DecodedCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (!isCursorRecord(parsed) || !hasValidCursorFields(parsed, sort)) {
      return { kind: 'invalid' };
    }
    return { kind: 'ok', cursor: parsed as unknown as Cursor };
  } catch {
    return { kind: 'invalid' };
  }
}

function cursorValueFor(sort: WarsSort, row: WarRowWithCreatorName): { v: string | null; isNull: boolean } {
  if (sort === 'newest' || sort === 'oldest') {
    return { v: row.created_at_text, isNull: false };
  }
  if (sort === 'alphabetical') {
    return { v: row.title, isNull: row.title === null };
  }
  return { v: row.ends_at_text, isNull: row.ends_at_text === null };
}

function encodeCursor(sort: WarsSort, row: WarRowWithCreatorName): string {
  const { v, isNull } = cursorValueFor(sort, row);
  const cursor: Cursor = { sort, v, isNull, id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/** Fetching `limit + 1` rows is how "more exist" is known: a cursor is emitted only when the extra row came back, and it anchors on the last row of the page proper. */
function pageOf(sort: WarsSort, rows: WarRowWithCreatorName[], limit: number): { page: WarRowWithCreatorName[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { page, nextCursor: rows.length > limit && last ? encodeCursor(sort, last) : null };
}

export async function listWars(db: Kysely<Database>, filter: ListWarsFilter): Promise<ListWarsOutcome> {
  const sort = filter.sort ?? 'newest';
  let query = baseWarsQuery(db, filter);

  if (filter.category) {
    query = query.where('wars.category', '=', filter.category);
  }
  query = applySearch(query, filter.q);
  query = ORDER_APPLIERS[sort](query);

  if (filter.cursor) {
    const decoded = decodeCursor(filter.cursor, sort);
    if (decoded.kind === 'invalid') {
      return { kind: 'invalidCursor' };
    }
    query = CURSOR_APPLIERS[sort](query, decoded.cursor);
  }

  const rows = await query.limit(filter.limit + 1).execute();
  const { page, nextCursor } = pageOf(sort, rows, filter.limit);
  return { kind: 'ok', wars: page.map(toWarWithCreatorName), nextCursor };
}

export interface WarPatch {
  title?: string;
  category?: string | null;
  visibility?: string;
  theme?: string;
  endsAt?: Date | null;
}

/** The column each patchable field writes; adding a field is a new row here, not another branch in `updateWar`. */
const WAR_PATCH_COLUMNS: Record<keyof WarPatch, string> = {
  title: 'title',
  category: 'category',
  visibility: 'visibility',
  theme: 'theme',
  endsAt: 'ends_at',
};

function warPatchValues(patch: WarPatch): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(WAR_PATCH_COLUMNS) as (keyof WarPatch)[]) {
    if (patch[key] !== undefined) values[WAR_PATCH_COLUMNS[key]] = patch[key];
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

/** Materialises stored status for expired Wars. Idempotent. */
export async function closeExpiredWars(db: Kysely<Database>, now: Date): Promise<number> {
  const rows = await db
    .updateTable('wars')
    .set({ status: 'closed' })
    .where('status', '=', 'published')
    .where('ends_at', 'is not', null)
    .where('ends_at', '<=', now)
    .returning('id')
    .execute();
  return rows.length;
}

/**
 * Removes a War and everything it owns, in any status (§6.1 "Deletion"), in one transaction and FK dependency order:
 * none of the foreign keys in `20260101000000_init.sql` cascade. Storage objects are the caller's job, after commit
 * (`deleteWar`, `warMediaStorage.ts`).
 */
export async function deleteWarRow(db: Kysely<Database>, warId: string): Promise<void> {
  await db.transaction().execute((trx) => deleteWarRowIn(trx, warId));
}

/** `deleteWarRow`'s body, run on an already-open transaction (Kysely cannot nest `.transaction()`) so callers such as banning a Voter can delete several Wars atomically with their own writes. */
export async function deleteWarRowIn(trx: Kysely<Database>, warId: string): Promise<void> {
  const matchupRows = await trx.selectFrom('matchups').select('id').where('war_id', '=', warId).execute();
  const matchupIds = matchupRows.map((row) => row.id);
  if (matchupIds.length > 0) {
    await trx.deleteFrom('votes').where('matchup_id', 'in', matchupIds).execute();
    await trx.deleteFrom('matchups').where('id', 'in', matchupIds).execute();
  }

  const contestantRows = await trx.selectFrom('contestants').select('id').where('war_id', '=', warId).execute();
  const contestantIds = contestantRows.map((row) => row.id);
  if (contestantIds.length > 0) {
    await trx.deleteFrom('contestant_media').where('contestant_id', 'in', contestantIds).execute();
  }

  await trx.deleteFrom('contestants').where('war_id', '=', warId).execute();
  await trx.deleteFrom('war_memberships').where('war_id', '=', warId).execute();
  await deleteReportsForWar(trx, warId);
  await trx.deleteFrom('wars').where('id', '=', warId).execute();
}

/** Ids of every War `creatorId` created, removed ones included (§6.7: a ban hard-deletes them all). */
export async function listWarIdsByCreator(db: Kysely<Database>, creatorId: string): Promise<string[]> {
  const rows = await db.selectFrom('wars').select('id').where('creator_id', '=', creatorId).execute();
  return rows.map((row) => row.id);
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
