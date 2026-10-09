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

/** Unlike `replyForOutcome`, a success carries a shared-cache header: an unlisted War's rankings are as public as a public War's (§6.4). */
function sendRankingsOutcome(reply: FastifyReply, outcome: RankingsOutcome) {
  if (outcome.kind === 'notFound') return sendNotFound(reply);
  void reply.header('Cache-Control', 'public, max-age=30');
  return reply.send(outcome.view);
}

export function registerRankingsRoutes(app: FastifyInstance, deps: RankingsRouteDeps): void {
  const { db } = deps;

  app.get<{ Params: { id: string } }>(
    '/wars/:id/rankings',
    {
      schema: { response: { 200: rankingsResponseSchema, 404: errorResponseSchema } },
      preHandler: optionalAuth(deps.auth),
    },
    async (request, reply) => {
      const outcome = await getRankings(db, request.params.id, request.voterId ?? null, new Date(), deps.publicBaseUrl);
      return sendRankingsOutcome(reply, outcome);
    },
  );
}
