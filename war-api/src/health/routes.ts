import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findCloseExpiredWarsLastSuccess } from './scheduledTaskStatusRepository.js';

/**
 * How old the last successful nightly run may be before the watchdog reports
 * failure: two missed nightly runs plus an hour of scheduling slack.
 */
export const SCHEDULED_TASKS_MAX_AGE_MS = 49 * 60 * 60 * 1000;

const watchdogResponseSchema = {
  type: 'object',
  required: ['status', 'last_success_at'],
  properties: {
    status: { type: 'string', enum: ['ok', 'stale'] },
    last_success_at: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

export interface HealthRoutesDeps {
  db: Kysely<Database>;
  /** The time source; tests replace it to move the clock. */
  now: () => Date;
}

/** Watchdog for the nightly scheduled tasks; polled by an external uptime check. */
export function registerHealthRoutes(app: FastifyInstance, deps: HealthRoutesDeps): void {
  app.get('/health/scheduled-tasks', { schema: { response: { 200: watchdogResponseSchema, 503: watchdogResponseSchema } } }, async (_request, reply) => {
    const lastSuccess = await findCloseExpiredWarsLastSuccess(deps.db);
    const fresh = isFresh(lastSuccess, deps.now());
    return reply
      .code(fresh ? 200 : 503)
      .header('cache-control', 'no-store')
      .send({ status: fresh ? 'ok' : 'stale', last_success_at: lastSuccess?.toISOString() ?? null });
  });
}

function isFresh(lastSuccess: Date | null, now: Date): boolean {
  return lastSuccess !== null && now.getTime() - lastSuccess.getTime() <= SCHEDULED_TASKS_MAX_AGE_MS;
}
