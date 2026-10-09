import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { castVoteForVoter, type CastVoteOutcome } from '../votes/votesService.js';
import { errorResponseSchema, failureResponse, sendNotFound } from '../shared/httpOutcomes.js';
import { rateLimitByVoter, rateLimitedResponseSchema, type RateLimiter } from '../shared/rateLimit.js';
import { findVisibleWar } from '../wars/warAccess.js';
import { countMatchupsForWar, countVotesByVoterInWar } from './matchupsRepository.js';
import { nextMatchupForVoter, nextMatchupResponseSchema } from './matchupsService.js';

/**
 * Fastify's own request-validation envelope, sent for a malformed body (missing or non-UUID `winner_id`)
 * before the handler runs. Distinct from the `{ error }` shape of this route's other 4xx responses.
 */
const fastifyValidationErrorSchema = {
  type: 'object',
  required: ['statusCode', 'code', 'error', 'message'],
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
};

/**
 * The single source of truth for the vote route's `403` `reason` values: the schema's `enum` and
 * `VoteForbiddenView` both derive from it, so an unlisted or omitted `reason` is a compile error
 * (`fast-json-stringify` does not enforce `enum` on output).
 */
const voteForbiddenReasons = ['war_not_published', 'not_joined'] as const;
type VoteForbiddenReason = (typeof voteForbiddenReasons)[number];
export interface VoteForbiddenView {
  error: string;
  reason: VoteForbiddenReason;
}

/**
 * The vote route's `403` carries a `reason` so a client can tell the two causes §6.3 defines (War not
 * published, voter not joined) apart without matching `error`'s text. `POST /wars/:id/join` has a single
 * cause and stays on `errorResponseSchema`.
 */
export const voteForbiddenResponseSchema = {
  type: 'object',
  required: ['error', 'reason'],
  properties: {
    error: { type: 'string' },
    reason: { type: 'string', enum: [...voteForbiddenReasons] },
  },
};

export interface MatchupsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
  /** Per-voter vote-casting limit (§8.4: 60/minute and 2,000/day). */
  rateLimiter: RateLimiter;
}

interface VoteResponse {
  status: number;
  body: unknown;
}

/**
 * Status and body per `castVoteForVoter` outcome kind. `Record` requires every kind, so one added to the union
 * without an entry here is a compile error. Kept apart from `replyForOutcome` because these responses carry
 * the `reason` discriminator and kinds (`created`, `retried`, `conflict`, `banned`) the shared mapper does not know.
 */
const VOTE_OUTCOME_RESPONSES: { [K in CastVoteOutcome['kind']]: (outcome: Extract<CastVoteOutcome, { kind: K }>) => VoteResponse } = {
  created: (outcome) => ({ status: 201, body: { vote_id: outcome.vote.id } }),
  retried: () => ({ status: 200, body: { status: 'already recorded' } }),
  conflict: () => ({ status: 409, body: { error: 'vote already cast for a different winner' } }),
  invalidWinner: () => ({ status: 422, body: { error: 'winner_id must be a contestant in this matchup' } }),
  warNotPublished: () => ({ status: 403, body: { error: 'War is not published', reason: 'war_not_published' } satisfies VoteForbiddenView }),
  notJoined: () => ({ status: 403, body: { error: 'voter has not joined this War', reason: 'not_joined' } satisfies VoteForbiddenView }),
  notFound: () => failureResponse({ kind: 'notFound' }),
  banned: () => ({ status: 401, body: { error: 'unauthorized' } }),
};

function responseForVote(outcome: CastVoteOutcome): VoteResponse {
  // TypeScript cannot correlate the looked-up handler with its outcome; the table above is what guarantees they match.
  return (VOTE_OUTCOME_RESPONSES[outcome.kind] as (outcome: CastVoteOutcome) => VoteResponse)(outcome);
}

export function registerMatchupsRoutes(app: FastifyInstance, deps: MatchupsRouteDeps): void {
  const { db, auth } = deps;
  const voteRateLimit = rateLimitByVoter(deps.rateLimiter);

  app.get<{ Params: { id: string } }>(
    '/wars/:id/matchups/next',
    bearerAuthRoute(auth, { response: { 200: nextMatchupResponseSchema, 204: {}, 404: errorResponseSchema } }),
    async (request, reply) => {
      // Matchups exist as soon as a War has two contestants, so a War the caller may not see is a 404, never a leak of its roster.
      if (!(await findVisibleWar(db, request.params.id, request.voterId))) {
        return sendNotFound(reply);
      }
      const view = await nextMatchupForVoter(db, request.params.id, request.voterId!, deps.publicBaseUrl);
      if (!view) {
        return reply.code(204).send();
      }
      return reply.send(view);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id/my-progress',
    bearerAuthRoute(auth, { response: { 404: errorResponseSchema } }),
    async (request, reply) => {
      if (!(await findVisibleWar(db, request.params.id, request.voterId))) {
        return sendNotFound(reply);
      }
      const [voted, total] = await Promise.all([
        countVotesByVoterInWar(db, request.params.id, request.voterId!),
        countMatchupsForWar(db, request.params.id),
      ]);
      return reply.send({ voted, total });
    },
  );

  app.post<{ Params: { id: string; mId: string }; Body: { winner_id: string } }>(
    '/wars/:id/matchups/:mId/vote',
    bearerAuthRoute(
      auth,
      {
        body: {
          type: 'object',
          required: ['winner_id'],
          properties: { winner_id: { type: 'string', format: 'uuid' } },
        },
        response: {
          201: { type: 'object', required: ['vote_id'], properties: { vote_id: { type: 'string', format: 'uuid' } } },
          200: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['already recorded'] } },
          },
          400: fastifyValidationErrorSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
          403: voteForbiddenResponseSchema,
          404: errorResponseSchema,
          429: rateLimitedResponseSchema,
        },
      },
      [voteRateLimit],
    ),
    async (request, reply) => {
      const outcome = await castVoteForVoter(db, {
        warId: request.params.id,
        matchupId: request.params.mId,
        voterId: request.voterId!,
        winnerId: request.body.winner_id,
      });

      const { status, body } = responseForVote(outcome);
      return reply.code(status).send(body);
    },
  );
}
