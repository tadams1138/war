import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import { createdAtText, decodeKeysetCursor, isAfterCursor, sliceKeysetPage } from '../shared/keysetCursor.js';

export interface ModerationLogEntry {
  id: string;
  action: string;
  staffVoterId: string;
  targetWarId: string | null;
  targetVoterId: string | null;
  createdAt: Date;
  /** The acting Staff member's display name; null if they have none. */
  staffName: string | null;
  /** The target Voter's display name; null when there is no target Voter. */
  targetVoterName: string | null;
  /** The target War's title, removed Wars included; null when there is no target War, it was hard-deleted, or it has no title. */
  targetWarTitle: string | null;
  /** True only when the entry targets a War whose row no longer exists (hard-deleted); a live untitled War is false. */
  targetWarDeleted: boolean;
}

function toEntry(row: ModerationLogRow): ModerationLogEntry {
  return {
    id: row.id,
    action: row.action,
    staffVoterId: row.staff_voter_id,
    targetWarId: row.target_war_id,
    targetVoterId: row.target_voter_id,
    createdAt: new Date(row.created_at),
    staffName: row.staff_name,
    targetVoterName: row.target_voter_name,
    targetWarTitle: row.target_war_title,
    targetWarDeleted: row.target_war_deleted,
  };
}

export const DEFAULT_MODERATION_LOG_LIMIT = 50;

export type ListModerationLogOutcome =
  | { kind: 'ok'; entries: ModerationLogEntry[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };


/** Names come from LEFT JOINs in the same statement: the log is append-only and its War target has no foreign key, so a deleted War or Voter yields a null name, never a dropped entry. */
function moderationLogQuery(db: Kysely<Database>) {
  return db
    .selectFrom('moderation_log')
    .leftJoin('voters as staff', 'staff.id', 'moderation_log.staff_voter_id')
    .leftJoin('voters as target_voter', 'target_voter.id', 'moderation_log.target_voter_id')
    .leftJoin('wars as target_war', 'target_war.id', 'moderation_log.target_war_id')
    .selectAll('moderation_log')
    .select([
      'staff.display_name as staff_name',
      'target_voter.display_name as target_voter_name',
      'target_war.title as target_war_title',
      sql<boolean>`moderation_log.target_war_id is not null and target_war.id is null`.as('target_war_deleted'),
    ])
    .select(createdAtText('moderation_log.created_at').as('created_at_text'))
    .orderBy('moderation_log.created_at', 'desc')
    .orderBy('moderation_log.id', 'desc');
}

type ModerationLogRow = Awaited<ReturnType<ReturnType<typeof moderationLogQuery>['execute']>>[number];

/** One page of logged Staff actions, newest first (spec §6.7); `nextCursor` is set only when a further entry exists. */
export async function listModerationLog(
  db: Kysely<Database>,
  options: { limit: number; cursor?: string },
): Promise<ListModerationLogOutcome> {
  let query = moderationLogQuery(db);

  if (options.cursor !== undefined) {
    const cursor = decodeKeysetCursor(options.cursor);
    if (!cursor) return { kind: 'invalidCursor' };
    query = query.where(isAfterCursor('moderation_log.created_at', 'moderation_log.id', cursor));
  }

  const { page, nextCursor } = sliceKeysetPage(await query.limit(options.limit + 1).execute(), options.limit);
  return { kind: 'ok', entries: page.map((row) => toEntry(row)), nextCursor };
}

export interface LogActionInput {
  action: string;
  staffVoterId: string;
  targetWarId?: string;
  targetVoterId?: string;
}

/** Records one Staff action (spec §6.7). Insert-only — there is no update or delete, mirroring votes' own immutability (§8.1). */
export async function logAction(db: Kysely<Database>, input: LogActionInput): Promise<void> {
  await db
    .insertInto('moderation_log')
    .values({
      id: newId(),
      action: input.action,
      staff_voter_id: input.staffVoterId,
      target_war_id: input.targetWarId ?? null,
      target_voter_id: input.targetVoterId ?? null,
    })
    .execute();
}
