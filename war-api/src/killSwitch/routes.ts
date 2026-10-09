import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { requireModeratorOrAdmin } from '../auth/guards.js';
import { isKillSwitchEnabled } from './killSwitchRepository.js';
import { changeKillSwitch } from './killSwitchService.js';

export interface KillSwitchRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const killSwitchViewSchema = {
  type: 'object',
  required: ['enabled'],
  properties: { enabled: { type: 'boolean' } },
};

export function registerKillSwitchRoutes(app: FastifyInstance, deps: KillSwitchRouteDeps): void {
  const { db, auth } = deps;

  app.get(
    '/kill-switch',
    bearerAuthRoute(auth, { response: { 200: killSwitchViewSchema, 403: errorResponseSchema } }, [requireModeratorOrAdmin]),
    async (_request, reply) => reply.send({ enabled: await isKillSwitchEnabled(db) }),
  );

  app.put<{ Body: { enabled: boolean } }>(
    '/kill-switch',
    bearerAuthRoute(
      auth,
      {
        body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
        response: { 200: killSwitchViewSchema, 403: errorResponseSchema },
      },
      [requireModeratorOrAdmin],
    ),
    async (request, reply) => reply.send({ enabled: await changeKillSwitch(db, request.voterId!, request.body.enabled) }),
  );
}
