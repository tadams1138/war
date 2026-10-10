import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.js';
import type { InMemoryObjectStorage } from './fakeStorage.js';

/** Raw reads that several step files use to check what the API left in the database. */

export function moderationLog(db: Kysely<Database>) {
  return db.selectFrom('moderation_log').selectAll().execute();
}

export async function countWars(db: Kysely<Database>): Promise<number> {
  return (await db.selectFrom('wars').selectAll().execute()).length;
}

export async function countVoters(db: Kysely<Database>): Promise<number> {
  const row = await db.selectFrom('voters').select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow();
  return Number(row.count);
}

export function allVotes(db: Kysely<Database>) {
  return db.selectFrom('votes').selectAll().execute();
}

export function matchupsOf(db: Kysely<Database>, warId: string) {
  return db.selectFrom('matchups').selectAll().where('war_id', '=', warId).execute();
}

/** Every key currently held by the in-memory object store, public and private. */
export function storedObjectKeys(storage: InMemoryObjectStorage): string[] {
  return [...storage.publicObjects.keys(), ...storage.privateObjects.keys()];
}
