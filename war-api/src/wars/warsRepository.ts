import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, WarsTable } from '../db/types.js';
import { newId } from '../db/uuid.js';

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
  const row = await db.selectFrom('wars').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toWar(row) : undefined;
}

export type WarsSort = 'newest' | 'oldest' | 'alphabetical' | 'expiring_soonest';

export interface ListWarsFilter {
  status?: string;
  category?: string;
  cursor?: string;
  limit: number;
  /**
   * Scopes the list to Wars created by this voter, across every status --
   * including their own drafts and invite-only Wars (war-spec.md §6.1).
   * Composes with `status`/`category` exactly as
   * those two already compose with each other. Only ever set from the
   * authenticated requester's own id -- never from a client-supplied one --
   * so this is the one filter here that can surface a voter's private Wars.
   */
  creatorId?: string;
  /** Defaults to `'newest'` (spec). */
  sort?: WarsSort;
  /** Case-insensitive substring match against `title` or the creator's `display_name` (spec). */
  q?: string;
}

export interface WarWithCreatorName extends War {
  creatorName: string | null;
}

export type ListWarsOutcome =
  | { kind: 'ok'; wars: WarWithCreatorName[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };

type WarRow = Selectable<WarsTable>;
type WarRowWithCreatorName = WarRow & { creator_name: string | null };

function toWarWithCreatorName(row: WarRowWithCreatorName): WarWithCreatorName {
  return { ...toWar(row), creatorName: row.creator_name };
}

/**
 * The ownership-scoping decision (own Wars, every status, vs. the default
 * public/published scoping), extracted purely to keep `listWars`'s own branch
 * count down -- it's one cohesive rule, not several independent filters,
 * and reads better as its own named step. Builds the base query itself so
 * its return type is inferred from actual `.where()` usage rather than
 * needing to be spelled out generically. Joins `voters` (LEFT, since
 * `creator_id` can be null and, even when set, a search match must still
 * work) so `q` can match on the creator's display name in the same query,
 * and so the listing can report `creator_name` without a second round trip.
 */
function baseWarsQuery(db: Kysely<Database>, filter: ListWarsFilter) {
  const query = db
    .selectFrom('wars')
    .leftJoin('voters', 'voters.id', 'wars.creator_id')
    .selectAll('wars')
    .select((eb) => eb.ref('voters.display_name').as('creator_name'));

  if (filter.creatorId) {
    const ownScoped = query.where('wars.creator_id', '=', filter.creatorId);
    return filter.status ? ownScoped.where('wars.status', '=', filter.status) : ownScoped;
  }
  // Default visibility/status scoping, applied whenever `creatorId` is
  // absent (spec, "Default scoping (no `creator=me`)"): never a
  // `draft` War, never an `invite_only` one, regardless of any `status`
  // filter supplied -- `status=draft` returns empty rather than another
  // voter's drafts, since `status != 'draft'` and `status = 'draft'` can
  // never both hold. Omitting `status` entirely defaults to `published`.
  // This is the one place that rule is enforced; every caller of
  // `listWars` inherits it, so a future caller cannot bypass it by
  // forgetting to ask.
  return query
    .where('wars.status', '=', filter.status ?? 'published')
    .where('wars.status', '!=', 'draft')
    .where('wars.visibility', '!=', 'invite_only');
}

type WarsQuery = ReturnType<typeof baseWarsQuery>;

/** Escapes `%`, `_`, and `\` so a raw search term is matched literally by `ILIKE`, never as a wildcard. */
function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Case-insensitive substring match against `wars.title` OR the creator's
 * `voters.display_name` (spec). A null or whitespace-only title never
 * matches on the title side (an empty-looking title has nothing meaningful
 * to search), but creator-name matching is unaffected either way.
 */
function applySearch(query: WarsQuery, q: string | undefined): WarsQuery {
  if (!q) return query;
  const pattern = `%${escapeLikePattern(q)}%`;
  return query.where(
    () =>
      sql<boolean>`(wars.title IS NOT NULL AND trim(wars.title) != '' AND wars.title ILIKE ${pattern}) OR voters.display_name ILIKE ${pattern}`,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidCursorId(id: unknown): id is string {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

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
  if (!isValidCursorId(value.id)) return false;
  if (typeof value.isNull !== 'boolean') return false;
  return isValidCursorValue(sort, value.v);
}

type DecodedCursor = { kind: 'ok'; cursor: Cursor } | { kind: 'invalid' };

/**
 * Decodes an opaque, base64-encoded JSON cursor (spec). Rejects anything
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

function cursorValueFor(sort: WarsSort, row: WarRow): { v: string | null; isNull: boolean } {
  if (sort === 'newest' || sort === 'oldest') {
    return { v: row.created_at.toISOString(), isNull: false };
  }
  if (sort === 'alphabetical') {
    return { v: row.title, isNull: row.title === null };
  }
  return { v: row.ends_at ? row.ends_at.toISOString() : null, isNull: row.ends_at === null };
}

function encodeCursor(sort: WarsSort, row: WarRow): string {
  const { v, isNull } = cursorValueFor(sort, row);
  const cursor: Cursor = { sort, v, isNull, id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/** `null` once a page comes back short (fewer than `limit` rows) -- there is nothing more to fetch. */
function nextCursorFor(sort: WarsSort, rows: WarRowWithCreatorName[], limit: number): string | null {
  if (rows.length !== limit) return null;
  const lastRow = rows[rows.length - 1];
  return lastRow ? encodeCursor(sort, lastRow) : null;
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

  const rows = await query.limit(filter.limit).execute();
  return { kind: 'ok', wars: rows.map(toWarWithCreatorName), nextCursor: nextCursorFor(sort, rows, filter.limit) };
}

export interface WarPatch {
  title?: string;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
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
    .where('status', '=', 'published')
    .where('ends_at', 'is not', null)
    .where('ends_at', '<=', now)
    .returning('id')
    .execute();
  return rows.length;
}

/**
 * Removes a War and everything it owns, in any status (spec §6.1
 * "Deletion") -- votes and matchups now exist well before publishing
 * (matchups generate incrementally as contestants are added, §4), so unlike
 * the old draft-only version this must clean up every dependent table, in
 * FK dependency order, in one transaction: none of `20260101000000_init.sql`'s
 * foreign keys cascade. Contestant media rows go first, matching
 * `deleteContestant`'s own precedent of leaving the underlying storage
 * objects in place rather than reaching into the object store.
 */
export async function deleteWarRow(db: Kysely<Database>, warId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
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
    await trx.deleteFrom('wars').where('id', '=', warId).execute();
  });
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
