import type { FastifyInstance } from 'fastify';
import { bearerAuthRoute } from '../auth/plugin.js';
import { requireModeratorOrAdmin } from '../auth/guards.js';
import { errorResponseSchema, sendNotFound } from '../shared/httpOutcomes.js';
import { pagingProperties, sendInvalidCursor, type PagingQuery } from '../shared/paging.js';
import type { AdminRouteDeps } from './adminRouteShared.js';
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

  app.get<{ Params: { id: string }; Querystring: PagingQuery }>(
    '/admin/voters/:id/votes',
    bearerAuthRoute(
      auth,
      {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: { type: 'object', properties: pagingProperties() },
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
      [requireModeratorOrAdmin],
    ),
    async (request, reply) => {
      const { limit, cursor } = request.query;
      const outcome = await listAdminVotes(db, request.params.id, { limit, cursor });
      if (outcome.kind === 'notFound') {
        return sendNotFound(reply);
      }
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      return reply.send({ votes: outcome.votes.map(presentAdminVote), next_cursor: outcome.nextCursor });
    },
  );
}
