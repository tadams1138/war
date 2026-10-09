import type { FastifyReply } from 'fastify';

const DEFAULT_PAGE_LIMIT = 50;

/** The `limit` (1-100) and opaque `cursor` query properties every paged endpoint takes. */
export function pagingProperties(defaultLimit: number = DEFAULT_PAGE_LIMIT) {
  return {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: defaultLimit },
    cursor: { type: 'string' },
  };
}

/** A paged request's query once ajv has applied the default and bounds, so `limit` is always a valid integer. */
export interface PagingQuery {
  limit: number;
  cursor?: string;
}

/** The 400 every paged endpoint sends for a cursor it did not issue. */
export function sendInvalidCursor(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ error: 'invalid cursor' });
}
