import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrateUp } from './testDb.js';

/**
 * Runs once per `vitest run`: uses `DATABASE_URL` when set (CI's postgres:16-alpine
 * service), otherwise starts a single Testcontainers Postgres for the whole run,
 * then migrates it. Test files inherit `DATABASE_URL` from this process.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const container = process.env.DATABASE_URL ? undefined : await new PostgreSqlContainer('postgres:16-alpine').start();
  if (container) {
    process.env.DATABASE_URL = container.getConnectionUri();
  }
  await migrateUp(process.env.DATABASE_URL!);

  return async () => {
    await container?.stop();
  };
}
