import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';
import { isUuid } from '../db/uuid.js';
import { createdAtText, decodeKeysetCursor, isAfterCursor, sliceKeysetPage } from '../shared/keysetCursor.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { containsPattern } from '../shared/likePattern.js';

export interface AdminVoter {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  isModerator: boolean;
  isAdmin: boolean;
  suspended: boolean;
  banned: boolean;
  createdAt: Date;
  warCount: number;
}

export type ListAdminVotersOutcome =
  | { kind: 'ok'; voters: AdminVoter[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };

export interface ListAdminVotersOptions {
  limit: number;
  cursor?: string;
  /** `suspended`, `banned`, or `staff` (a Moderator or an Admin). */
  status?: string;
  /** Case-insensitive substring of the display name. */
  q?: string;
}

function baseAdminVotersQuery(db: Kysely<Database>) {
  return db
    .selectFrom('voters')
    .select([
      'voters.id',
      'voters.display_name',
      'voters.avatar_url',
      'voters.is_moderator',
      'voters.is_admin',
      'voters.suspended_at',
      'voters.banned_at',
      'voters.created_at',
    ])
    .select(sql<number>`(select count(*)::int from wars where wars.creator_id = voters.id)`.as('war_count'))
    .select(createdAtText('voters.created_at').as('created_at_text'))
    .orderBy('voters.created_at', 'desc')
    .orderBy('voters.id', 'desc');
}

type AdminVoterRow = Awaited<ReturnType<ReturnType<typeof baseAdminVotersQuery>['execute']>>[number];

function toAdminVoter(row: AdminVoterRow): AdminVoter {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isModerator: row.is_moderator,
    isAdmin: row.is_admin,
    suspended: row.suspended_at !== null,
    banned: row.banned_at !== null,
    createdAt: new Date(row.created_at),
    warCount: row.war_count,
  };
}

type AdminVotersQuery = ReturnType<typeof baseAdminVotersQuery>;

const STATUS_FILTERS: Record<string, (query: AdminVotersQuery) => AdminVotersQuery> = {
  suspended: (query) => query.where('voters.suspended_at', 'is not', null),
  banned: (query) => query.where('voters.banned_at', 'is not', null),
  staff: (query) => query.where((eb) => eb.or([eb('voters.is_moderator', '=', true), eb('voters.is_admin', '=', true)])),
};

function applyStatus(query: AdminVotersQuery, status: string | undefined): AdminVotersQuery {
  return status === undefined ? query : (STATUS_FILTERS[status]?.(query) ?? query);
}

function applySearch(query: AdminVotersQuery, q: string | undefined): AdminVotersQuery {
  return q ? query.where('voters.display_name', 'ilike', containsPattern(q)) : query;
}

/** Every Voter (spec §6.7 "Visibility"), newest first. The War count (removed Wars included) comes from the same query, never one lookup per row. */
export async function listAdminVoters(db: Kysely<Database>, options: ListAdminVotersOptions): Promise<ListAdminVotersOutcome> {
  let query = applySearch(applyStatus(baseAdminVotersQuery(db), options.status), options.q);

  if (options.cursor !== undefined) {
    const cursor = decodeKeysetCursor(options.cursor);
    if (!cursor) return { kind: 'invalidCursor' };
    query = query.where(isAfterCursor('voters.created_at', 'voters.id', cursor));
  }

  const { page, nextCursor } = sliceKeysetPage(await query.limit(options.limit + 1).execute(), options.limit);
  return { kind: 'ok', voters: page.map(toAdminVoter), nextCursor };
}

export interface AdminVoterWar {
  id: string;
  title: string | null;
  status: string;
  removedAt: Date | null;
}

export interface AdminVoterDetail extends AdminVoter {
  wars: AdminVoterWar[];
}

async function listVoterWars(db: Kysely<Database>, voterId: string, now: Date): Promise<AdminVoterWar[]> {
  const rows = await db
    .selectFrom('wars')
    .select(['id', 'title', 'status', 'ends_at', 'removed_at'])
    .where('creator_id', '=', voterId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: effectiveStatus({ status: row.status, endsAt: row.ends_at }, now),
    removedAt: row.removed_at ? new Date(row.removed_at) : null,
  }));
}

/** One Voter by id with every War they created, removed ones included, newest first and unpaged; `undefined` only when no row exists. */
export async function findAdminVoter(db: Kysely<Database>, id: string, now: Date): Promise<AdminVoterDetail | undefined> {
  if (!isUuid(id)) return undefined;
  const row = await baseAdminVotersQuery(db).where('voters.id', '=', id).executeTakeFirst();
  if (!row) return undefined;
  return { ...toAdminVoter(row), wars: await listVoterWars(db, id, now) };
}
