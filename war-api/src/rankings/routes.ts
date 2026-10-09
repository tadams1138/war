import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { AuthDependencies } from '../auth/authService.js';
import { optionalAuth } from '../auth/plugin.js';
import { errorResponseSchema, sendNotFound } from '../shared/httpOutcomes.js';
import { getRankings, rankingsResponseSchema, type RankingsOutcome } from './rankingsService.js';

export interface RankingsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
}

function cacheControlFor(visibility: string): string {
  return visibility === 'invite_only' ? 'private, max-age=30' : 'public, max-age=30';
}

/** Unlike `replyForOutcome`, a success carries cache headers and an invite-only War answers an anonymous or non-member viewer with 401 (§6.4). */
function sendRankingsOutcome(reply: FastifyReply, outcome: RankingsOutcome) {
  switch (outcome.kind) {
    case 'notFound':
      return sendNotFound(reply);
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
    {
      schema: { response: { 200: rankingsResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema } },
      preHandler: optionalAuth(deps.auth),
    },
    async (request, reply) => {
      const outcome = await getRankings(db, request.params.id, request.voterId ?? null, new Date(), deps.publicBaseUrl);
      return sendRankingsOutcome(reply, outcome);
    },
  );
}
