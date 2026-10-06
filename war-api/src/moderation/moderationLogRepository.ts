import type { Kysely, Selectable } from 'kysely';
import type { Database, ModerationLogTable } from '../db/types.js';
import { newId } from '../db/uuid.js';
import { createdAtText, decodeKeysetCursor, isAfterCursor, sliceKeysetPage } from '../shared/keysetCursor.js';

export interface ModerationLogEntry {
  id: string;
  action: string;
  staffVoterId: string;
  targetWarId: string | null;
  targetVoterId: string | null;
  createdAt: Date;
}

function toEntry(row: Selectable<ModerationLogTable>): ModerationLogEntry {
  return {
    id: row.id,
    action: row.action,
    staffVoterId: row.staff_voter_id,
    targetWarId: row.target_war_id,
    targetVoterId: row.target_voter_id,
    createdAt: new Date(row.created_at),
  };
}

export const DEFAULT_MODERATION_LOG_LIMIT = 50;

export type ListModerationLogOutcome =
  | { kind: 'ok'; entries: ModerationLogEntry[]; nextCursor: string | null }
  | { kind: 'invalidCursor' };


/** One page of logged Staff actions, newest first (spec §6.7); `nextCursor` is set only when a further entry exists. */
export async function listModerationLog(
  db: Kysely<Database>,
  options: { limit: number; cursor?: string },
): Promise<ListModerationLogOutcome> {
  let query = db
    .selectFrom('moderation_log')
    .selectAll()
    .select(createdAtText('created_at').as('created_at_text'))
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc');

  if (options.cursor !== undefined) {
    const cursor = decodeKeysetCursor(options.cursor);
    if (!cursor) return { kind: 'invalidCursor' };
    query = query.where(isAfterCursor('created_at', 'id', cursor));
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
