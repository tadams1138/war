import path from 'node:path';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import type { Database } from '../../src/db/types.js';

let db: Kysely<Database> | undefined;
let pool: pg.Pool | undefined;

/** Applies `db/migrations` with the same `node-pg-migrate` runner `npm run migrate` uses. */
export async function migrateUp(connectionString: string): Promise<void> {
  await runner({
    databaseUrl: connectionString,
    dir: path.resolve(process.cwd(), 'db/migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}

/**
 * Connects tests to the Postgres that `globalSetup.ts` made available through
 * `DATABASE_URL` (CI's postgres:16-alpine service, or one Testcontainers
 * Postgres shared by the whole run).
 */
export async function getTestDb(): Promise<Kysely<Database>> {
  if (db) {
    return db;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; test/setup/globalSetup.ts should have provided it.');
  }

  pool = new pg.Pool({ connectionString });
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return db;
}

/**
 * Wipes all domain tables between scenarios so each test starts from a clean slate.
 * Tables that reference these (moderation_log, reports, ...) are emptied by CASCADE;
 * list any new FK-less table here explicitly.
 */
export async function truncateAll(): Promise<void> {
  const instance = await getTestDb();
  await sql`TRUNCATE TABLE votes, war_memberships, matchups, contestant_media, contestants, refresh_tokens, wars, voters, platform_settings RESTART IDENTITY CASCADE`.execute(
    instance,
  );
}

/** Releases this test file's connections. */
export async function closeTestDb(): Promise<void> {
  await db?.destroy();
  db = undefined;
  pool = undefined;
}
