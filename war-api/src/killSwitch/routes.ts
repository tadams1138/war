import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
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

/** The 503 body/schema `POST /wars` sends while War creation is disabled. */
export const warCreationDisabledResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string', enum: ['war_creation_disabled'] } },
};

/** A preHandler refusing every caller, Staff included, with 503 while the kill switch is on. Run after auth. */
export function rejectWhileKillSwitchOn(db: Kysely<Database>) {
  return async function preHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (await isKillSwitchEnabled(db)) {
      await reply.code(503).send({ error: 'war_creation_disabled' });
    }
  };
}

export function registerKillSwitchRoutes(app: FastifyInstance, deps: KillSwitchRouteDeps): void {
  const { db, auth } = deps;

  app.get(
    '/kill-switch',
    bearerAuthRoute(auth, { response: { 200: killSwitchViewSchema, 403: errorResponseSchema } }, [requireModeratorOrAdmin(db)]),
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
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => reply.send({ enabled: await changeKillSwitch(db, request.voterId!, request.body.enabled) }),
  );
}
