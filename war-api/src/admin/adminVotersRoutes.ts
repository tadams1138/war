import type { FastifyInstance } from 'fastify';
import { bearerAuthRoute } from '../auth/plugin.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { findAdminVoter, listAdminVoters, type AdminVoter, type AdminVoterDetail } from './adminVotersRepository.js';
import { pagingProperties, sendInvalidCursor, type AdminRouteDeps } from './adminRouteShared.js';

const adminVoterProperties = {
  id: { type: 'string', format: 'uuid' },
  display_name: { type: ['string', 'null'] },
  avatar_url: { type: ['string', 'null'] },
  is_moderator: { type: 'boolean' },
  is_admin: { type: 'boolean' },
  suspended: { type: 'boolean' },
  banned: { type: 'boolean' },
  created_at: { type: 'string', format: 'date-time' },
  war_count: { type: 'integer' },
};

const adminVoterRequired = Object.keys(adminVoterProperties);

function presentAdminVoter(voter: AdminVoter) {
  return {
    id: voter.id,
    display_name: voter.displayName,
    avatar_url: voter.avatarUrl,
    is_moderator: voter.isModerator,
    is_admin: voter.isAdmin,
    suspended: voter.suspended,
    banned: voter.banned,
    created_at: voter.createdAt.toISOString(),
    war_count: voter.warCount,
  };
}

const adminVoterDetailSchema = {
  type: 'object',
  required: [...adminVoterRequired, 'wars'],
  properties: {
    ...adminVoterProperties,
    wars: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'status', 'removed_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: ['string', 'null'] },
          status: { type: 'string' },
          removed_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
  },
};

function presentAdminVoterDetail(voter: AdminVoterDetail) {
  return {
    ...presentAdminVoter(voter),
    wars: voter.wars.map((war) => ({
      id: war.id,
      title: war.title,
      status: war.status,
      removed_at: war.removedAt ? war.removedAt.toISOString() : null,
    })),
  };
}

export function registerAdminVotersRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { db, auth } = deps;

  app.get(
    '/admin/voters',
    bearerAuthRoute(
      auth,
      {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['suspended', 'banned', 'staff'] },
            q: { type: 'string' },
            ...pagingProperties,
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['voters', 'next_cursor'],
            properties: {
              voters: { type: 'array', items: { type: 'object', required: adminVoterRequired, properties: adminVoterProperties } },
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
      const outcome = await listAdminVoters(db, { status, q, limit, cursor });
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      return reply.send({ voters: outcome.voters.map(presentAdminVoter), next_cursor: outcome.nextCursor });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/admin/voters/:id',
    bearerAuthRoute(
      auth,
      {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: { 200: adminVoterDetailSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const voter = await findAdminVoter(db, request.params.id, new Date());
      if (!voter) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.send(presentAdminVoterDetail(voter));
    },
  );
}
