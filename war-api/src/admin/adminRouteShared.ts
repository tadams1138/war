import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AuthDependencies } from '../auth/authService.js';

export interface AdminRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}
