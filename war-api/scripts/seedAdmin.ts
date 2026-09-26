import type { Kysely } from 'kysely';
import type { Database } from '../src/db/types.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { setVoterRole, type Voter } from '../src/auth/votersRepository.js';

/** Grants the admin role to `voterId` (spec §6.7). The only way to create the first Admin on a fresh deployment, since no Admin yet exists to call the grant endpoint. */
export async function seedAdmin(db: Kysely<Database>, voterId: string): Promise<Voter | undefined> {
  return setVoterRole(db, voterId, 'admin', true);
}

async function main(): Promise<void> {
  const voterId = process.argv[2];
  if (!voterId) {
    console.error('Usage: npm run seed-admin -- <voterId>');
    process.exit(1);
  }

  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  const result = await seedAdmin(db, voterId);
  await db.destroy();

  if (!result) {
    console.error(`No voter found with id ${voterId}`);
    process.exit(1);
  }
  console.log(`Granted admin to voter ${voterId}`);
}

if (process.argv[1]?.endsWith('seedAdmin.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
