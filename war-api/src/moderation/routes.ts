import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { requireModeratorOrAdmin } from '../auth/guards.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { pagingProperties, sendInvalidCursor, type PagingQuery } from '../shared/paging.js';
import { listModerationLog, type ModerationLogEntry } from './moderationLogRepository.js';

export interface ModerationLogRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const moderationLogEntryViewSchema = {
  type: 'object',
  required: ['id', 'action', 'actor_voter_id', 'target_war_id', 'target_voter_id', 'created_at', 'actor_name', 'target_voter_name', 'target_war_title', 'target_war_deleted'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    action: { type: 'string' },
    actor_voter_id: { type: 'string', format: 'uuid' },
    target_war_id: { type: ['string', 'null'], format: 'uuid' },
    target_voter_id: { type: ['string', 'null'], format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    actor_name: { type: ['string', 'null'] },
    target_voter_name: { type: ['string', 'null'] },
    target_war_title: { type: ['string', 'null'] },
    target_war_deleted: { type: 'boolean' },
  },
};

function presentEntry(entry: ModerationLogEntry) {
  return {
    id: entry.id,
    action: entry.action,
    actor_voter_id: entry.actorVoterId,
    target_war_id: entry.targetWarId,
    target_voter_id: entry.targetVoterId,
    created_at: entry.createdAt.toISOString(),
    actor_name: entry.actorName,
    target_voter_name: entry.targetVoterName,
    target_war_title: entry.targetWarTitle,
    target_war_deleted: entry.targetWarDeleted,
  };
}

export function registerModerationLogRoutes(app: FastifyInstance, deps: ModerationLogRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Querystring: PagingQuery }>(
    '/moderation-log',
    bearerAuthRoute(
      auth,
      {
        querystring: { type: 'object', properties: pagingProperties() },
        // No `400` entry: declaring one would make Fastify serialize its own validation 400 through it (see `GET /wars`).
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
      [requireModeratorOrAdmin],
    ),
    async (request, reply) => {
      const { voter } = request;
      const isAdmin = voter?.isAdmin === true;
      const visibility = { moderation: voter?.isModerator === true, roleChange: isAdmin, ownerAction: isAdmin };
      const outcome = await listModerationLog(db, { ...request.query, visibility });
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      return reply.send({ entries: outcome.entries.map(presentEntry), next_cursor: outcome.nextCursor });
    },
  );
}
