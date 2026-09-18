import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AuthDependencies } from '../auth/authService.js';
import { authenticatedVoterId } from '../auth/authService.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { rankingsFor, rankingsResponseSchema, type RankingsOutcome } from './rankingsService.js';

export interface RankingsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
}

async function optionalVoterId(auth: AuthDependencies, authorizationHeader: string | undefined): Promise<string | null> {
  if (!authorizationHeader) return null;
  try {
    return await authenticatedVoterId(auth, authorizationHeader);
  } catch {
    return null;
  }
}

function cacheControlFor(visibility: string): string {
  return visibility === 'invite_only' ? 'private, max-age=30' : 'public, max-age=30';
}

function sendRankingsOutcome(reply: FastifyReply, outcome: RankingsOutcome) {
  switch (outcome.kind) {
    case 'notFound':
      return reply.code(404).send({ error: 'not found' });
    case 'unauthorized':
      return reply.code(401).send({ error: 'unauthorized' });
    case 'ok':
      void reply.header('Cache-Control', cacheControlFor(outcome.visibility));
      return reply.send(outcome.view);
  }
}

export function registerRankingsRoutes(app: FastifyInstance, deps: RankingsRouteDeps): void {
  const { db } = deps;

  app.get<{ Params: { id: string } }>(
    '/wars/:id/rankings',
    { schema: { response: { 200: rankingsResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const voterId = await optionalVoterId(deps.auth, request.headers.authorization);
      const outcome = await rankingsFor(db, request.params.id, voterId, new Date(), deps.publicBaseUrl);
      return sendRankingsOutcome(reply, outcome);
    },
  );
}
