import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { DEFAULT_MODERATION_LOG_LIMIT, listModerationLog, type ModerationLogEntry } from './moderationLogRepository.js';

export interface ModerationLogRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const moderationLogEntryViewSchema = {
  type: 'object',
  required: ['id', 'action', 'staff_voter_id', 'target_war_id', 'target_voter_id', 'created_at', 'staff_name', 'target_voter_name', 'target_war_title', 'target_war_deleted'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    action: { type: 'string' },
    staff_voter_id: { type: 'string', format: 'uuid' },
    target_war_id: { type: ['string', 'null'], format: 'uuid' },
    target_voter_id: { type: ['string', 'null'], format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    staff_name: { type: ['string', 'null'] },
    target_voter_name: { type: ['string', 'null'] },
    target_war_title: { type: ['string', 'null'] },
    target_war_deleted: { type: 'boolean' },
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
    staff_name: entry.staffName,
    target_voter_name: entry.targetVoterName,
    target_war_title: entry.targetWarTitle,
    target_war_deleted: entry.targetWarDeleted,
  };
}

export function registerModerationLogRoutes(app: FastifyInstance, deps: ModerationLogRouteDeps): void {
  const { db, auth } = deps;

  app.get(
    '/moderation-log',
    bearerAuthRoute(
      auth,
      {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: DEFAULT_MODERATION_LOG_LIMIT },
            cursor: { type: 'string' },
          },
        },
        // Deliberately no `400` entry: declaring one would make Fastify serialize its own
        // querystring-validation 400 through it (see `GET /wars`).
        response: {
          200: {
            type: 'object',
            required: ['entries', 'next_cursor'],
            properties: {
              entries: { type: 'array', items: moderationLogEntryViewSchema },
              next_cursor: { type: ['string', 'null'] },
            },
          },
          403: errorResponseSchema,
        },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      // ajv has already applied the default and bounds, so `limit` is always a valid integer here.
      const { limit, cursor } = request.query as { limit: number; cursor?: string };
      const outcome = await listModerationLog(db, { limit, cursor });
      if (outcome.kind === 'invalidCursor') {
        return reply.code(400).send({ error: 'invalid cursor' });
      }
      return reply.send({ entries: outcome.entries.map(presentEntry), next_cursor: outcome.nextCursor });
    },
  );
}
