import type { Kysely, Selectable } from 'kysely';
import type { Database, ModerationLogTable } from '../db/types.js';
import { newId } from '../db/uuid.js';

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

/** Every logged Staff action, newest first (spec §6.7). */
export async function listModerationLog(db: Kysely<Database>): Promise<ModerationLogEntry[]> {
  const rows = await db.selectFrom('moderation_log').selectAll().orderBy('created_at', 'desc').orderBy('id', 'desc').execute();
  return rows.map((row) => toEntry(row));
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
