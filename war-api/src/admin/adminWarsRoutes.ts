import type { FastifyInstance } from 'fastify';
import { bearerAuthRoute } from '../auth/plugin.js';
import { requireModerator } from '../auth/guards.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { pagingProperties, sendInvalidCursor, type PagingQuery } from '../shared/paging.js';
import type { AdminRouteDeps } from './adminRouteShared.js';
import { listAdminWars, type AdminWar } from './adminWarsRepository.js';

const adminWarProperties = {
  id: { type: 'string', format: 'uuid' },
  title: { type: ['string', 'null'] },
  status: { type: 'string' },
  visibility: { type: 'string' },
  creator_id: { type: ['string', 'null'], format: 'uuid' },
  creator_name: { type: ['string', 'null'] },
  created_at: { type: 'string', format: 'date-time' },
  removed_at: { type: ['string', 'null'], format: 'date-time' },
  unaddressed_report_count: { type: 'integer' },
};

const adminWarRequired = Object.keys(adminWarProperties);

function presentAdminWar(war: AdminWar) {
  return {
    id: war.id,
    title: war.title,
    status: war.status,
    visibility: war.visibility,
    creator_id: war.creatorId,
    creator_name: war.creatorName,
    created_at: war.createdAt.toISOString(),
    removed_at: war.removedAt ? war.removedAt.toISOString() : null,
    unaddressed_report_count: war.unaddressedReportCount,
  };
}

export function registerAdminWarsRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Querystring: PagingQuery & { status?: string; q?: string } }>(
    '/admin/wars',
    bearerAuthRoute(
      auth,
      {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['draft', 'published', 'closed', 'removed'] },
            q: { type: 'string' },
            ...pagingProperties(),
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['wars', 'next_cursor'],
            properties: {
              wars: { type: 'array', items: { type: 'object', required: adminWarRequired, properties: adminWarProperties } },
              next_cursor: { type: ['string', 'null'] },
            },
          },
          403: errorResponseSchema,
        },
      },
      [requireModerator],
    ),
    async (request, reply) => {
      const { status, q, limit, cursor } = request.query;
      const outcome = await listAdminWars(db, { now: new Date(), status, q, limit, cursor });
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      return reply.send({ wars: outcome.wars.map(presentAdminWar), next_cursor: outcome.nextCursor });
    },
  );
}
