import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { getTestDb } from '../setup/testDb.js';

/**
 * Columns `src/db/types.ts` types as non-null (`string` / `Date`). The schema must
 * agree: a nullable column behind a non-null type is a lie the compiler cannot catch.
 */
const NON_NULL_IN_TYPES: Record<string, string[]> = {
  voters: ['created_at'],
  wars: ['created_at'],
  contestants: ['war_id', 'created_at'],
  refresh_tokens: ['voter_id', 'created_at'],
  contestant_media: ['contestant_id', 'created_at'],
  matchups: ['war_id', 'contestant_a_id', 'contestant_b_id', 'created_at'],
  war_memberships: ['joined_at'],
  votes: ['matchup_id', 'voter_id', 'winner_id', 'created_at'],
  reports: ['war_id', 'reporter_id', 'created_at'],
  moderation_log: ['staff_voter_id', 'created_at'],
};

describe('schema nullability agrees with db/types.ts', () => {
  it('declares NOT NULL on every column the row types treat as always present', async () => {
    // Arrange
    const db = await getTestDb();

    // Act
    const result = await sql<{ table_name: string; column_name: string }>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and is_nullable = 'YES'`.execute(db);

    // Assert
    const nullable = result.rows.map((row) => `${row.table_name}.${row.column_name}`);
    const expectedNonNull = Object.entries(NON_NULL_IN_TYPES).flatMap(([table, columns]) =>
      columns.map((column) => `${table}.${column}`),
    );
    expect(nullable.filter((column) => expectedNonNull.includes(column))).toEqual([]);
  });
});
