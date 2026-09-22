import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { castVoteForVoter, type CastVoteOutcome } from '../votes/votesService.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { rateLimitByVoter, rateLimitedResponseSchema, type RateLimiter } from '../shared/rateLimit.js';
import { countMatchupsForWar, countVotesByVoterInWar } from './matchupsRepository.js';
import { nextMatchupForVoter, nextMatchupResponseSchema } from './matchupsService.js';

/**
 * Fastify's own request-validation error envelope (ajv, via
 * `@fastify/ajv-compiler`) -- distinct from this route's own `{ error }`
 * shape used for its other 4xx responses. Produced for a malformed body
 * (missing or non-UUID `winner_id`) before the handler ever runs, so
 * `castVoteForVoter`'s own `invalidWinner` (422) is never reached in that
 * case. Verified against Fastify 5.11.0; transcribed into spec.
 */
const validationErrorResponseSchema = {
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
 * The single source of truth for this route's `403` `reason` values --
 * both the schema's `enum` and `VoteForbiddenView`'s type derive from this
 * array, so an unlisted reason or an omitted `reason` at a send site is a
 * compile error rather than a value `fast-json-stringify` would otherwise
 * pass straight through (it does not enforce `enum` on output).
 */
const voteForbiddenReasons = ['war_not_active', 'not_joined'] as const;
export type VoteForbiddenReason = (typeof voteForbiddenReasons)[number];
export interface VoteForbiddenView {
  error: string;
  reason: VoteForbiddenReason;
}

/**
 * This route's `403` -- unlike its other `{ error }`-only 4xx responses --
 * also carries a `reason` discriminator so a client can branch on which of
 * the two forbidden causes occurred without matching `error`'s message text
 * (spec, addendum, 2026-08-30). Scoped to this route only: `POST
 * /wars/:id/join`'s `403` has a single cause and stays on the shared
 * `errorResponseSchema`.
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
  /** Per-voter vote-casting limit (spec §8.4: 60/minute and 2,000/day). */
  rateLimiter: RateLimiter;
}

/**
 * Status and body per `castVoteForVoter` outcome kind, keyed by
 * `CastVoteOutcome['kind']` -- a `Record` requires every key present, so an
 * outcome kind added to the union without an entry here is a compile
 * error, without one `case` per kind driving this route's own branch count
 * up.
 */
const VOTE_OUTCOME_RESPONSES: Record<CastVoteOutcome['kind'], (outcome: CastVoteOutcome) => { status: number; body: unknown }> = {
  created: (outcome) => ({ status: 201, body: { vote_id: (outcome as { kind: 'created'; vote: { id: string } }).vote.id } }),
  retried: () => ({ status: 200, body: { status: 'already recorded' } }),
  conflict: () => ({ status: 409, body: { error: 'vote already cast for a different winner' } }),
  invalidWinner: () => ({ status: 422, body: { error: 'winner_id must be a contestant in this matchup' } }),
  warNotActive: () => ({ status: 403, body: { error: 'War is not active', reason: 'war_not_active' } satisfies VoteForbiddenView }),
  notJoined: () => ({ status: 403, body: { error: 'voter has not joined this War', reason: 'not_joined' } satisfies VoteForbiddenView }),
  notFound: () => ({ status: 404, body: { error: 'not found' } }),
};

export function registerMatchupsRoutes(app: FastifyInstance, deps: MatchupsRouteDeps): void {
  const { db, auth } = deps;
  const voteRateLimit = rateLimitByVoter(deps.rateLimiter);

  app.get<{ Params: { id: string } }>(
    '/wars/:id/matchups/next',
    bearerAuthRoute(auth, { response: { 200: nextMatchupResponseSchema, 204: {} } }),
    async (request, reply) => {
      const view = await nextMatchupForVoter(db, request.params.id, request.voterId!, deps.publicBaseUrl);
      if (!view) {
        return reply.code(204).send();
      }
      return reply.send(view);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id/my-progress',
    bearerAuthRoute(auth),
    async (request, reply) => {
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
          400: validationErrorResponseSchema,
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

      const { status, body } = VOTE_OUTCOME_RESPONSES[outcome.kind](outcome);
      return reply.code(status).send(body);
    },
  );
}
