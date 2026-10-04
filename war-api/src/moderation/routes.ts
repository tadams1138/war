import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { listModerationLog, type ModerationLogEntry } from './moderationLogRepository.js';

export interface ModerationLogRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const moderationLogEntryViewSchema = {
  type: 'object',
  required: ['id', 'action', 'staff_voter_id', 'target_war_id', 'target_voter_id', 'created_at'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    action: { type: 'string' },
    staff_voter_id: { type: 'string', format: 'uuid' },
    target_war_id: { type: ['string', 'null'], format: 'uuid' },
    target_voter_id: { type: ['string', 'null'], format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

function presentEntry(entry: ModerationLogEntry) {
  return {
    id: entry.id,
    action: entry.action,
    staff_voter_id: entry.staffVoterId,
    target_war_id: entry.targetWarId,
    target_voter_id: entry.targetVoterId,
    created_at: entry.createdAt.toISOString(),
  };
}

export function registerModerationLogRoutes(app: FastifyInstance, deps: ModerationLogRouteDeps): void {
  const { db, auth } = deps;

  app.get(
    '/moderation-log',
    bearerAuthRoute(
      auth,
      {
        response: {
          200: { type: 'object', required: ['entries'], properties: { entries: { type: 'array', items: moderationLogEntryViewSchema } } },
          403: errorResponseSchema,
        },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (_request, reply) => {
      const entries = await listModerationLog(db);
      return reply.send({ entries: entries.map(presentEntry) });
    },
  );
}
