import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AuthDependencies } from '../auth/authService.js';

export interface AdminRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const DEFAULT_PAGE_LIMIT = 50;

/** The `limit` (1-100, default 50) and opaque `cursor` query properties every admin list endpoint takes. */
export const pagingProperties = {
  limit: { type: 'integer', minimum: 1, maximum: 100, default: DEFAULT_PAGE_LIMIT },
  cursor: { type: 'string' },
};

/** The 400 every admin list endpoint sends for a cursor it did not issue. */
export function sendInvalidCursor(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ error: 'invalid cursor' });
}
