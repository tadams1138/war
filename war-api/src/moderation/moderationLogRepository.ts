import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';

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
