import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute, optionalAuth, requireAuthIf } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import {
  rejectWhileKillSwitchOn,
  rejectWhileSuspended,
  requireModeratorOrAdmin,
  suspendedResponseSchema,
  warCreationDisabledResponseSchema,
} from '../auth/guards.js';
import { errorResponseSchema, replyForOutcome, sendNotFound, validationErrorResponseSchema } from '../shared/httpOutcomes.js';
import { pagingProperties, sendInvalidCursor, type PagingQuery } from '../shared/paging.js';
import { reportSchemaViolations, rejectInvalidBody } from '../shared/bodyValidation.js';
import { rateLimitByVoter, rateLimitedResponseSchema, type RateLimiter } from '../shared/rateLimit.js';
import { readUploadedFile, sendNoFileUploaded, uploadErrorResponseSchema } from '../contestants/uploadRequest.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { countContestantsByWarIds, countContestantsForWar } from '../contestants/contestantsRepository.js';
import { findVisibleWar } from './warAccess.js';
import { presentWarDetail, presentWarSummary, warDetailResponseSchema, warSummaryProperties } from './warPresenter.js';
import { clearVotes, createWarForVoter, deleteWar, joinWar, patchWar, publishWar, setShareImage, unpublishWar } from './warsService.js';
import { removeWar } from './removeWarService.js';
import { closeExpiredWars, listWars, type War, type WarsSort } from './warsRepository.js';

export interface WarsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  storage: ObjectStorage;
  publicBaseUrl: string;
  internalTaskToken: string;
  /** Per-voter War-creation limit (§8.4: 10/hour). */
  rateLimiter: RateLimiter;
  /** The limiter contestant image uploads use too (§8.4: 100/hour): one image-upload budget per voter, so this route is no loophole around it. */
  imageUploadRateLimiter: RateLimiter;
}

/** The one place "wants own-Wars scoping" is decided; the schema enum and the handler both defer to it. */
function wantsOwnWars(query: { creator?: string }): boolean {
  return query.creator === 'me';
}

const warsPaging = pagingProperties(20);

interface CreateWarBody {
  title?: string | null;
  category?: string | null;
  visibility?: string;
  media_mode?: string;
  theme?: string;
  ends_at?: string | null;
}

interface PatchWarBody {
  title?: string;
  category?: string | null;
  visibility?: string;
  theme?: string;
  ends_at?: string | null;
}

export function registerWarsRoutes(app: FastifyInstance, deps: WarsRouteDeps): void {
  const { db, auth } = deps;

  /** A War the caller has just created or changed, presented with its current contestant count. */
  async function presentOwnedWar(war: War) {
    return presentWarSummary(war, new Date(), await countContestantsForWar(db, war.id), deps.publicBaseUrl, null);
  }

  app.get<{
    Querystring: PagingQuery & {
      status?: string;
      category?: string;
      creator?: string;
      sort?: WarsSort;
      q?: string;
    };
  }>(
    '/wars',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            category: { type: 'string' },
            cursor: warsPaging.cursor,
            limit: warsPaging.limit,
            // Anything but the literal "me" fails Fastify's own validation and gets its standard envelope.
            creator: { type: 'string', enum: ['me'] },
            sort: { type: 'string', enum: ['newest', 'oldest', 'expiring_soonest', 'alphabetical'] },
            q: { type: 'string' },
          },
        },
        // No `400` entry: declaring one would make Fastify serialize its own validation 400s
        // (`creator=someone-else`) through it, stripping their `statusCode`/`code`/`message`.
        response: {
          200: {
            type: 'object',
            required: ['wars', 'next_cursor'],
            properties: {
              wars: { type: 'array', items: { $ref: 'WarSummary#' } },
              next_cursor: { type: ['string', 'null'] },
            },
          },
          401: errorResponseSchema,
        },
      },
      // Not `bearerAuthRoute`: the route is open to anonymous callers for every query except `creator=me`
      // (§6.1), so it must not carry a bearer `security` marker in the OpenAPI document.
      preHandler: requireAuthIf(auth, (request) => wantsOwnWars(request.query as { creator?: string })),
    },
    async (request, reply) => {
      const { status, category, cursor, limit, sort, q } = request.query;
      const now = new Date();
      const outcome = await listWars(db, {
        now,
        status,
        category,
        cursor,
        limit,
        creatorId: wantsOwnWars(request.query) ? request.voterId : undefined,
        sort,
        q,
      });
      if (outcome.kind === 'invalidCursor') {
        return sendInvalidCursor(reply);
      }
      const counts = await countContestantsByWarIds(
        db,
        outcome.wars.map((war) => war.id),
      );
      return reply.send({
        wars: outcome.wars.map((war) => presentWarSummary(war, now, counts.get(war.id) ?? 0, deps.publicBaseUrl, war.creatorName)),
        next_cursor: outcome.nextCursor,
      });
    },
  );

  app.post<{ Body: CreateWarBody }>(
    '/wars',
    {
      ...reportSchemaViolations,
      ...bearerAuthRoute(
        auth,
        {
          body: {
            type: 'object',
            properties: {
              title: warSummaryProperties.title,
              category: warSummaryProperties.category,
              visibility: { type: 'string' },
              media_mode: { type: 'string' },
              theme: { type: 'string' },
              ends_at: { type: ['string', 'null'] },
            },
          },
          response: {
            201: { $ref: 'WarSummary#' },
            422: validationErrorResponseSchema,
            403: suspendedResponseSchema,
            429: rateLimitedResponseSchema,
            503: warCreationDisabledResponseSchema,
          },
        },
        // Before the rate limit, so a refused attempt spends none of the budget.
        // The kill switch (503) is checked first and wins over a suspension (403).
        [rejectWhileKillSwitchOn(db), rejectWhileSuspended, rejectInvalidBody, rateLimitByVoter(deps.rateLimiter)],
      ),
    },
    async (request, reply) => {
      const body = request.body;
      const outcome = await createWarForVoter(db, {
        creatorId: request.voterId!,
        title: body.title,
        category: body.category ?? null,
        visibility: body.visibility,
        mediaMode: body.media_mode,
        theme: body.theme,
        endsAt: body.ends_at,
      });

      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      // A freshly created War has no contestants yet.
      return reply.code(201).send(presentWarSummary(outcome.value, new Date(), 0, deps.publicBaseUrl, null));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id',
    { schema: { response: { 200: warDetailResponseSchema, 404: errorResponseSchema } }, preHandler: optionalAuth(auth) },
    async (request, reply) => {
      const war = await findVisibleWar(db, request.params.id, request.voterId);
      if (!war) {
        return sendNotFound(reply);
      }
      return reply.send(await presentWarDetail(db, war, new Date(), deps.publicBaseUrl, request.voterId));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/wars/:id',
    bearerAuthRoute(auth, {
      response: {
        204: {},
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    }),
    async (request, reply) => {
      const outcome = await deleteWar(db, deps.storage, request.log, request.params.id, request.voterId!);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { id: string }; Body: PatchWarBody }>(
    '/wars/:id',
    {
      ...reportSchemaViolations,
      ...bearerAuthRoute(
        auth,
        {
          body: {
            type: 'object',
            properties: {
              title: warSummaryProperties.title,
              category: warSummaryProperties.category,
              visibility: warSummaryProperties.visibility,
              theme: warSummaryProperties.theme,
              ends_at: warSummaryProperties.ends_at,
            },
          },
          response: {
            200: { $ref: 'WarSummary#' },
            403: errorResponseSchema,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
        [rejectInvalidBody],
      ),
    },
    async (request, reply) => {
      const body = request.body;
      const outcome = await patchWar(db, request.params.id, request.voterId!, {
        title: body.title,
        category: body.category,
        visibility: body.visibility,
        theme: body.theme,
        endsAt: body.ends_at,
      });

      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(await presentOwnedWar(outcome.value));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/publish',
    bearerAuthRoute(auth, {
      response: {
        200: { $ref: 'WarSummary#' },
        403: errorResponseSchema,
        404: errorResponseSchema,
        422: validationErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const outcome = await publishWar(db, request.params.id, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(await presentOwnedWar(outcome.value));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/unpublish',
    bearerAuthRoute(auth, {
      response: {
        200: { $ref: 'WarSummary#' },
        403: errorResponseSchema,
        404: errorResponseSchema,
        422: validationErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const outcome = await unpublishWar(db, request.params.id, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(await presentOwnedWar(outcome.value));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/clear-votes',
    bearerAuthRoute(auth, {
      response: {
        200: { $ref: 'WarSummary#' },
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    }),
    async (request, reply) => {
      const outcome = await clearVotes(db, request.params.id, request.voterId!);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(await presentOwnedWar(outcome.value));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/wars/:id/share-image',
    bearerAuthRoute(
      auth,
      {
        response: {
          200: { $ref: 'WarSummary#' },
          403: errorResponseSchema,
          404: errorResponseSchema,
          422: uploadErrorResponseSchema,
          429: rateLimitedResponseSchema,
        },
      },
      [rateLimitByVoter(deps.imageUploadRateLimiter)],
    ),
    async (request, reply) => {
      const upload = await readUploadedFile(request);
      if (!upload) {
        return sendNoFileUploaded(reply);
      }
      const outcome = await setShareImage(db, deps.storage, { warId: request.params.id, voterId: request.voterId!, ...upload });
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(await presentOwnedWar(outcome.value));
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

  app.post<{ Params: { id: string } }>(
    '/wars/:id/remove',
    bearerAuthRoute(auth, { response: { 204: {}, 403: errorResponseSchema, 404: errorResponseSchema } }, [requireModeratorOrAdmin]),
    async (request, reply) => {
      const outcome = await removeWar(db, deps.storage, request.log, request.voterId!, request.params.id);
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
