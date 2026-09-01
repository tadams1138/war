import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute, requireAuthIf } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema, replyForOutcome, validationErrorResponseSchema } from '../shared/httpOutcomes.js';
import { countContestantsByWarIds, countContestantsForWar } from '../contestants/contestantsRepository.js';
import { presentWarDetail, presentWarSummary, warDetailResponseSchema } from './warPresenter.js';
import { activateWar, closeWar, createWarForVoter, getWar, joinWar, patchWar } from './warsService.js';
import { closeExpiredWars, listWars } from './warsRepository.js';

export interface WarsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  publicBaseUrl: string;
  internalTaskToken: string;
}

export function registerWarsRoutes(app: FastifyInstance, deps: WarsRouteDeps): void {
  const { db, auth } = deps;

  app.get<{ Querystring: { status?: string; category?: string; cursor?: string; limit?: string; creator?: string } }>(
    '/wars',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            category: { type: 'string' },
            cursor: { type: 'string' },
            limit: { type: 'string' },
            // The only accepted value is the literal "me"; anything else
            // fails Fastify's own ajv validation and returns its standard
            // envelope, never this API's `{ error }` shape (spec §7.2,
            // §11.2.1 "Addendum (2026-09-01)").
            creator: { type: 'string', enum: ['me'] },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['wars'],
            properties: { wars: { type: 'array', items: { $ref: 'WarSummary#' } } },
          },
          401: errorResponseSchema,
        },
      },
      // Deliberately not `bearerAuthRoute`: this route stays open to
      // anonymous callers for every query combination except `creator=me`
      // (spec §7.2), so it must not carry a `security: [{bearerAuth: []}]`
      // marker in the OpenAPI document either.
      preHandler: requireAuthIf(auth, (request) => (request.query as { creator?: string }).creator === 'me'),
    },
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit ?? 20) || 20, 100);
      const creatorId = request.query.creator === 'me' ? request.voterId : undefined;
      const wars = await listWars(db, {
        status: request.query.status,
        category: request.query.category,
        cursor: request.query.cursor,
        limit,
        creatorId,
      });
      const now = new Date();
      const counts = await countContestantsByWarIds(
        db,
        wars.map((war) => war.id),
      );
      return reply.send({ wars: wars.map((war) => presentWarSummary(war, now, counts.get(war.id) ?? 0)) });
    },
  );

  app.post(
    '/wars',
    bearerAuthRoute(auth, { response: { 201: { $ref: 'WarSummary#' }, 422: validationErrorResponseSchema } }),
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await createWarForVoter(db, {
        creatorId: request.voterId!,
        title: body.title as string,
        category: (body.category as string | null | undefined) ?? null,
        visibility: body.visibility as string | undefined,
        mediaMode: body.media_mode as string | undefined,
        contestantSchema: body.contestant_schema,
        endsAt: body.ends_at as string | null | undefined,
      });

      if (outcome.kind === 'validationError') {
        return reply.code(422).send({ error: 'validation error', details: outcome.errors });
      }
      // A freshly created War has no contestants yet -- creation only inserts the `wars` row.
      return reply.code(201).send(presentWarSummary(outcome.war, new Date(), 0));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id',
    { schema: { response: { 200: warDetailResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const lookup = await getWar(db, request.params.id);
      if (lookup.kind === 'notFound') {
        return reply.code(404).send({ error: 'not found' });
      }
      const detail = await presentWarDetail(db, lookup.war, new Date(), deps.publicBaseUrl);
      return reply.send(detail);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/wars/:id',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await patchWar(
        db,
        request.params.id,
        request.voterId!,
        {
          title: body.title as string | undefined,
          category: body.category as string | null | undefined,
          visibility: body.visibility as string | undefined,
          contestantSchema: body.contestant_schema,
          endsAt: body.ends_at as string | null | undefined,
        },
        new Date(),
      );

      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id)));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/activate',
    bearerAuthRoute(auth, {
      response: {
        200: { $ref: 'WarSummary#' },
        403: errorResponseSchema,
        404: errorResponseSchema,
        422: validationErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const outcome = await activateWar(db, request.params.id, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id)));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/close',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const outcome = await closeWar(db, request.params.id, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id)));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/join',
    bearerAuthRoute(auth, { response: { 204: {}, 403: errorResponseSchema, 404: errorResponseSchema } }),
    async (request, reply) => {
      const outcome = await joinWar(db, request.params.id, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(204).send();
    },
  );

  app.post('/internal/close-expired-wars', { schema: { hide: true } }, async (request, reply) => {
    const token = request.headers['x-internal-token'];
    if (token !== deps.internalTaskToken) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const closed = await closeExpiredWars(db, new Date());
    return reply.send({ closed });
  });
}
