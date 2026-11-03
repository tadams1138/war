import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/** Records that close-expired-wars completed successfully at `at` (§12.8). */
export async function recordCloseExpiredWarsSuccess(db: Kysely<Database>, at: Date): Promise<void> {
  await db
    .insertInto('platform_settings')
    .values({ id: 1, close_expired_wars_last_success_at: at })
    .onConflict((conflict) => conflict.column('id').doUpdateSet({ close_expired_wars_last_success_at: at }))
    .execute();
}

/** When close-expired-wars last succeeded, or null if it never has. */
export async function findCloseExpiredWarsLastSuccess(db: Kysely<Database>): Promise<Date | null> {
  const row = await db
    .selectFrom('platform_settings')
    .select('close_expired_wars_last_success_at')
    .where('id', '=', 1)
    .executeTakeFirst();
  return row?.close_expired_wars_last_success_at ?? null;
}
