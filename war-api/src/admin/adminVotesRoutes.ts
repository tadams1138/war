import type { FastifyInstance } from 'fastify';
import { bearerAuthRoute } from '../auth/plugin.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { pagingProperties, sendInvalidCursor, type AdminRouteDeps } from './adminRouteShared.js';
import { listAdminVotes, type AdminVote } from './adminVotesRepository.js';

const adminVoteProperties = {
  id: { type: 'string', format: 'uuid' },
  war_id: { type: 'string', format: 'uuid' },
  war_title: { type: ['string', 'null'] },
  matchup_id: { type: 'string', format: 'uuid' },
  winner_contestant_id: { type: 'string', format: 'uuid' },
  winner_name: { type: 'string' },
  loser_contestant_id: { type: 'string', format: 'uuid' },
  loser_name: { type: 'string' },
  cast_at: { type: 'string', format: 'date-time' },
};

function presentAdminVote(vote: AdminVote) {
  return {
    id: vote.id,
    war_id: vote.warId,
    war_title: vote.warTitle,
    matchup_id: vote.matchupId,
    winner_contestant_id: vote.winnerContestantId,
    winner_name: vote.winnerName,
    loser_contestant_id: vote.loserContestantId,
    loser_name: vote.loserName,
    cast_at: vote.castAt.toISOString(),
  };
}

export function registerAdminVotesRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Params: { id: string } }>(
    '/admin/voters/:id/votes',
    bearerAuthRoute(
      auth,
      {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: { type: 'object', properties: pagingProperties },
        response: {
          200: {
            type: 'object',
            required: ['votes', 'next_cursor'],
            properties: {
              votes: { type: 'array', items: { type: 'object', required: Object.keys(adminVoteProperties), properties: adminVoteProperties } },
              next_cursor: { type: ['string', 'null'] },
            },
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      // ajv has already applied the default and bounds, so `limit` is always a valid integer here.
      const { limit, cursor } = request.query as { limit: number; cursor?: string };
      const outcome = await listAdminVotes(db, request.params.id, { limit, cursor });
      if (outcome.kind === 'notFound') {
        return reply.code(404).send({ error: 'not found' });
      }
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      return reply.send({ votes: outcome.votes.map(presentAdminVote), next_cursor: outcome.nextCursor });
    },
  );
}
