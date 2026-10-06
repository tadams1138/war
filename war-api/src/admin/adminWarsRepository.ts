import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';
import { isUuid } from '../db/uuid.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { createdAtText, decodeKeysetCursor, isAfterCursor, sliceKeysetPage } from '../shared/keysetCursor.js';
import { containsPattern } from '../shared/likePattern.js';

export interface AdminWar {
  id: string;
  title: string | null;
  status: string;
  visibility: string;
  creatorId: string | null;
  creatorName: string | null;
  createdAt: Date;
  removedAt: Date | null;
  unaddressedReportCount: number;
}

export type ListAdminWarsOutcome =
  | { kind: 'ok'; wars: AdminWar[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };

export interface ListAdminWarsOptions {
  limit: number;
  cursor?: string;
  /** A War status, or `removed` (removed_at set); any other status means "not removed, with that status". */
  status?: string;
  /** Case-insensitive substring of the title or the creator's display name. */
  q?: string;
}

function baseAdminWarsQuery(db: Kysely<Database>) {
  return db
    .selectFrom('wars')
    .leftJoin('voters', 'voters.id', 'wars.creator_id')
    .select([
      'wars.id',
      'wars.title',
      'wars.status',
      'wars.visibility',
      'wars.creator_id',
      'wars.created_at',
      'wars.removed_at',
      'voters.display_name as creator_name',
    ])
    .select(
      sql<number>`(select count(*)::int from reports where reports.war_id = wars.id and reports.addressed = false)`.as(
        'unaddressed_report_count',
      ),
    )
    .select(createdAtText('wars.created_at').as('created_at_text'))
    .orderBy('wars.created_at', 'desc')
    .orderBy('wars.id', 'desc');
}

type AdminWarsQuery = ReturnType<typeof baseAdminWarsQuery>;
type AdminWarRow = Awaited<ReturnType<AdminWarsQuery['execute']>>[number];

function applyStatus(query: AdminWarsQuery, status: string | undefined): AdminWarsQuery {
  if (status === undefined) return query;
  if (status === 'removed') return query.where('wars.removed_at', 'is not', null);
  return query.where('wars.removed_at', 'is', null).where('wars.status', '=', status);
}

function applySearch(query: AdminWarsQuery, q: string | undefined): AdminWarsQuery {
  if (!q) return query;
  const pattern = containsPattern(q);
  return query.where((eb) =>
    eb.or([
      eb('wars.title', 'ilike', pattern),
      sql<boolean>`wars.creator_id = any(array(select id from voters where display_name ilike ${pattern}))`,
    ]),
  );
}

function toAdminWar(row: AdminWarRow): AdminWar {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    createdAt: new Date(row.created_at),
    removedAt: row.removed_at ? new Date(row.removed_at) : null,
    unaddressedReportCount: row.unaddressed_report_count,
  };
}

/** One page of every War, whatever its status, visibility or removal (spec §6.7 "Visibility"), newest first. Creator name and report count come from the same query, never one lookup per row. */
export async function listAdminWars(db: Kysely<Database>, options: ListAdminWarsOptions): Promise<ListAdminWarsOutcome> {
  let query = applySearch(applyStatus(baseAdminWarsQuery(db), options.status), options.q);

  if (options.cursor !== undefined) {
    const cursor = decodeKeysetCursor(options.cursor);
    if (!cursor) return { kind: 'invalidCursor' };
    query = query.where(isAfterCursor('wars.created_at', 'wars.id', cursor));
  }

  const { page, nextCursor } = sliceKeysetPage(await query.limit(options.limit + 1).execute(), options.limit);
  return { kind: 'ok', wars: page.map(toAdminWar), nextCursor };
}

export interface AdminWarContestant {
  id: string;
  name: string;
  winCount: number;
  appearanceCount: number;
}

export interface AdminWarDetail extends AdminWar {
  contestants: AdminWarContestant[];
  reportCount: number;
}

async function countReports(db: Kysely<Database>, warId: string): Promise<number> {
  const row = await db
    .selectFrom('reports')
    .select(sql<number>`count(*)::int`.as('count'))
    .where('war_id', '=', warId)
    .executeTakeFirstOrThrow();
  return row.count;
}

/** One War by id, removed or not, with its contestants (ordered as the public detail orders them) and report totals; `undefined` only when no row exists. */
export async function findAdminWar(db: Kysely<Database>, id: string): Promise<AdminWarDetail | undefined> {
  if (!isUuid(id)) return undefined;
  const row = await baseAdminWarsQuery(db).where('wars.id', '=', id).executeTakeFirst();
  if (!row) return undefined;
  const [contestants, reportCount] = await Promise.all([listContestantsByWar(db, id), countReports(db, id)]);
  return {
    ...toAdminWar(row),
    contestants: contestants.map((c) => ({ id: c.id, name: c.name, winCount: c.winCount, appearanceCount: c.appearanceCount })),
    reportCount,
  };
}
