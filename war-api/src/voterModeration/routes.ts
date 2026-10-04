import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { findVoterById, type Voter } from '../auth/votersRepository.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { errorResponseSchema, replyForOutcome } from '../shared/httpOutcomes.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { changeBan, changeSuspension } from './voterModerationService.js';

export interface VoterModerationRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  storage: ObjectStorage;
}

const voterModerationViewSchema = {
  type: 'object',
  required: ['id', 'suspended', 'banned'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    suspended: { type: 'boolean' },
    banned: { type: 'boolean' },
  },
};

function presentVoterModeration(voter: Voter): { id: string; suspended: boolean; banned: boolean } {
  return { id: voter.id, suspended: voter.suspended, banned: voter.banned };
}

/** The 403 body/schema `POST /wars` sends while the caller is suspended. */
export const suspendedResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string', enum: ['suspended'] } },
};

/** A preHandler refusing a suspended caller with 403 `suspended` (spec §6.7). Run after auth. */
export function rejectWhileSuspended(db: Kysely<Database>) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const voter = await findVoterById(db, request.voterId!);
    if (voter?.suspended) {
      await reply.code(403).send({ error: 'suspended' });
    }
  };
}

export function registerVoterModerationRoutes(app: FastifyInstance, deps: VoterModerationRouteDeps): void {
  const { db, auth } = deps;

  app.put<{ Params: { id: string }; Body: { suspended: boolean } }>(
    '/voters/:id/suspension',
    bearerAuthRoute(
      auth,
      {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: { type: 'object', required: ['suspended'], properties: { suspended: { type: 'boolean' } } },
        response: { 200: voterModerationViewSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await changeSuspension(db, request.voterId!, request.params.id, request.body.suspended);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentVoterModeration(outcome.value));
    },
  );

  app.put<{ Params: { id: string }; Body: { banned: boolean } }>(
    '/voters/:id/ban',
    bearerAuthRoute(
      auth,
      {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        body: { type: 'object', required: ['banned'], properties: { banned: { type: 'boolean' } } },
        response: { 200: voterModerationViewSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await changeBan(db, deps.storage, request.log, request.voterId!, request.params.id, request.body.banned);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentVoterModeration(outcome.value));
    },
  );
}
