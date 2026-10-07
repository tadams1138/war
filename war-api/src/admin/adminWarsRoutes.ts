import type { FastifyInstance } from 'fastify';
import { bearerAuthRoute } from '../auth/plugin.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { pagingProperties, sendInvalidCursor, type AdminRouteDeps } from './adminRouteShared.js';
import { findAdminWar, listAdminWars, type AdminWar, type AdminWarDetail } from './adminWarsRepository.js';

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

const adminWarDetailSchema = {
  type: 'object',
  required: [...adminWarRequired, 'contestants', 'report_count'],
  properties: {
    ...adminWarProperties,
    report_count: { type: 'integer' },
    contestants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'win_count', 'appearance_count'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          win_count: { type: 'integer' },
          appearance_count: { type: 'integer' },
        },
      },
    },
  },
};

function presentAdminWarDetail(war: AdminWarDetail) {
  return {
    ...presentAdminWar(war),
    report_count: war.reportCount,
    contestants: war.contestants.map((c) => ({
      id: c.id,
      name: c.name,
      win_count: c.winCount,
      appearance_count: c.appearanceCount,
    })),
  };
}

export function registerAdminWarsRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { db, auth } = deps;

  app.get(
    '/admin/wars',
    bearerAuthRoute(
      auth,
      {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['draft', 'published', 'closed', 'removed'] },
            q: { type: 'string' },
            ...pagingProperties,
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
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      // ajv has already applied the default and bounds, so `limit` is always a valid integer here.
      const { status, q, limit, cursor } = request.query as { status?: string; q?: string; limit: number; cursor?: string };
      const outcome = await listAdminWars(db, { now: new Date(), status, q, limit, cursor });
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      return reply.send({ wars: outcome.wars.map(presentAdminWar), next_cursor: outcome.nextCursor });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/admin/wars/:id',
    bearerAuthRoute(
      auth,
      {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: { 200: adminWarDetailSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const war = await findAdminWar(db, request.params.id, new Date());
      if (!war) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.send(presentAdminWarDetail(war));
    },
  );
}
