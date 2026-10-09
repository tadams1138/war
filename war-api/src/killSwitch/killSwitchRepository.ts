import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';

/** Whether War creation is globally disabled (§6.7). Never set means off. */
export async function isKillSwitchEnabled(db: Kysely<Database>): Promise<boolean> {
  const row = await db.selectFrom('platform_settings').select('war_creation_kill_switch').where('id', '=', 1).executeTakeFirst();
  return row?.war_creation_kill_switch ?? false;
}

export async function setKillSwitch(db: Kysely<Database>, enabled: boolean): Promise<void> {
  await db
    .insertInto('platform_settings')
    .values({ id: 1, war_creation_kill_switch: enabled })
    .onConflict((conflict) => conflict.column('id').doUpdateSet({ war_creation_kill_switch: enabled, updated_at: sql`now()` }))
    .execute();
}
