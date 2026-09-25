import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema, replyForOutcome } from '../shared/httpOutcomes.js';
import { requireAdmin } from './rolesAccess.js';
import { grantRole } from './rolesService.js';

export interface RolesRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const voterRoleViewSchema = {
  type: 'object',
  required: ['id', 'is_moderator', 'is_admin'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    is_moderator: { type: 'boolean' },
    is_admin: { type: 'boolean' },
  },
};

export function registerRolesRoutes(app: FastifyInstance, deps: RolesRouteDeps): void {
  const { db, auth } = deps;

  app.put<{ Params: { id: string; role: string }; Body: { granted: boolean } }>(
    '/voters/:id/roles/:role',
    bearerAuthRoute(
      auth,
      {
        params: {
          type: 'object',
          required: ['id', 'role'],
          properties: { id: { type: 'string' }, role: { type: 'string', enum: ['moderator', 'admin'] } },
        },
        body: { type: 'object', required: ['granted'], properties: { granted: { type: 'boolean' } } },
        response: { 200: voterRoleViewSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await grantRole(db, request.params.id, request.params.role as 'moderator' | 'admin', request.body.granted);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send({ id: outcome.value.id, is_moderator: outcome.value.isModerator, is_admin: outcome.value.isAdmin });
    },
  );
}
