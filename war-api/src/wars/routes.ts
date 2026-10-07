import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute, optionalAuth, requireAuthIf } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema, replyForOutcome, validationErrorResponseSchema } from '../shared/httpOutcomes.js';
import { rejectWhileKillSwitchOn, warCreationDisabledResponseSchema } from '../killSwitch/routes.js';
import { rejectWhileSuspended, suspendedResponseSchema } from '../voterModeration/routes.js';
import { reportSchemaViolations, rejectInvalidBody } from '../shared/bodyValidation.js';
import { rateLimitByVoter, rateLimitedResponseSchema, type RateLimiter } from '../shared/rateLimit.js';
import { extensionFor } from '../contestants/imageProcessing.js';
import type { ObjectStorage } from '../contestants/storage.js';
import { countContestantsByWarIds, countContestantsForWar } from '../contestants/contestantsRepository.js';
import { isWarVisibleTo } from './warAccess.js';
import { presentWarDetail, presentWarSummary, warDetailResponseSchema, warSummaryProperties } from './warPresenter.js';
import {
  clearVotes,
  createWarForVoter,
  deleteWar,
  getWar,
  joinWar,
  patchWar,
  publishWar,
  setShareImage,
  unpublishWar,
} from './warsService.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { removeWar } from './removeWarService.js';
import { closeExpiredWars, listWars, type WarsSort } from './warsRepository.js';

export interface WarsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  storage: ObjectStorage;
  publicBaseUrl: string;
  internalTaskToken: string;
  /** Per-voter War-creation limit (spec §8.4: 10/hour). */
  rateLimiter: RateLimiter;
  /** The same limiter contestant image uploads use (spec §8.4: 100/hour) --
   * one shared image-upload bucket per voter, not a separate one for this
   * route, so it isn't a loophole around that limit. */
  imageUploadRateLimiter: RateLimiter;
}

/** Mirrors contestants/routes.ts's own imageUploadErrorResponseSchema -- this
 * route's 422 also has a no-file shape (`{ error }`) and a validation-error
 * shape (`{ error, details }`) sharing one status. */
const shareImageErrorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * "Wants own-Wars scoping" has three places it could be stated -- the ajv
 * enum, this preHandler predicate, and the handler ternary -- and stating
 * it in more than one risks a future edit to one silently diverging from
 * the others. The handler's fallback when `creator` isn't `"me"` is an
 * unfiltered `creatorId` (war-spec.md §6.1's default-scoping rule in
 * `warsRepository.ts` closes what that would otherwise expose), so this
 * predicate is the one place that decision is made.
 */
function wantsOwnWars(query: { creator?: string }): boolean {
  return query.creator === 'me';
}

const DEFAULT_WARS_PAGE_LIMIT = 20;

/** Defaults to `'newest'` (spec) -- ajv's querystring enum already guarantees `raw`, when present, is one of the four valid sort modes. */
function resolveWarsListSort(raw: string | undefined): WarsSort {
  return (raw as WarsSort | undefined) ?? 'newest';
}

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

  app.get<{
    Querystring: {
      status?: string;
      category?: string;
      cursor?: string;
      limit?: number;
      creator?: string;
      sort?: string;
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
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: DEFAULT_WARS_PAGE_LIMIT },
            // The only accepted value is the literal "me"; anything else
            // fails Fastify's own ajv validation and returns its standard
            // envelope, never this API's `{ error }` shape.
            creator: { type: 'string', enum: ['me'] },
            sort: { type: 'string', enum: ['newest', 'oldest', 'expiring_soonest', 'alphabetical'] },
            q: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['wars', 'next_cursor'],
            properties: {
              wars: { type: 'array', items: { $ref: 'WarSummary#' } },
              next_cursor: { type: ['string', 'null'] },
            },
          },
          // Deliberately no `400` entry here: registering one would make
          // Fastify serialize *every* 400 from this route -- including its
          // own ajv querystring-validation envelope (`creator=someone-else`,
          // spec) -- through this route's schema, silently stripping that
          // envelope's `statusCode`/`code`/`message` down to `error` alone.
          // The `reply.code(400).send(...)` below for an invalid cursor
          // still sends its own literal `{ error: 'invalid cursor' }` body;
          // it just isn't schema-validated/serialized against a declared
          // shape.
          401: errorResponseSchema,
        },
      },
      // Deliberately not `bearerAuthRoute`: this route stays open to
      // anonymous callers for every query combination except `creator=me`
      // (spec), so it must not carry a `security: [{bearerAuth: []}]`
      // marker in the OpenAPI document either.
      preHandler: requireAuthIf(auth, (request) => wantsOwnWars(request.query as { creator?: string })),
    },
    async (request, reply) => {
      // ajv has already enforced 1-100 and applied the default.
      const limit = request.query.limit ?? DEFAULT_WARS_PAGE_LIMIT;
      const creatorId = wantsOwnWars(request.query) ? request.voterId : undefined;
      const sort = resolveWarsListSort(request.query.sort);
      const now = new Date();
      const outcome = await listWars(db, {
        now,
        status: request.query.status,
        category: request.query.category,
        cursor: request.query.cursor,
        limit,
        creatorId,
        sort,
        q: request.query.q,
      });
      if (outcome.kind === 'invalidCursor') {
        return reply.code(400).send({ error: 'invalid cursor' });
      }
      const counts = await countContestantsByWarIds(
        db,
        outcome.wars.map((war) => war.id),
      );
      return reply.send({
        wars: outcome.wars.map((war) =>
          presentWarSummary(war, now, counts.get(war.id) ?? 0, deps.publicBaseUrl, war.creatorName),
        ),
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
        [rejectWhileKillSwitchOn(db), rejectWhileSuspended(db), rejectInvalidBody, rateLimitByVoter(deps.rateLimiter)],
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

      if (outcome.kind === 'validationError') {
        return reply.code(422).send({ error: 'validation error', details: outcome.errors });
      }
      // A freshly created War has no contestants yet -- creation only inserts the `wars` row.
      return reply.code(201).send(presentWarSummary(outcome.war, new Date(), 0, deps.publicBaseUrl, null));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id',
    { schema: { response: { 200: warDetailResponseSchema, 404: errorResponseSchema } }, preHandler: optionalAuth(auth) },
    async (request, reply) => {
      const lookup = await getWar(db, request.params.id);
      if (lookup.kind === 'notFound') {
        return reply.code(404).send({ error: 'not found' });
      }
      const now = new Date();
      if (!isWarVisibleTo(lookup.war, now, request.voterId)) {
        return reply.code(404).send({ error: 'not found' });
      }
      const detail = await presentWarDetail(db, lookup.war, now, deps.publicBaseUrl, request.voterId);
      return reply.send(detail);
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
      const outcome = await deleteWar(db, deps.storage, request.log, request.params.id, request.voterId!, new Date());
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
      const outcome = await patchWar(
        db,
        request.params.id,
        request.voterId!,
        {
          title: body.title,
          category: body.category,
          visibility: body.visibility,
          theme: body.theme,
          endsAt: body.ends_at,
        },
        new Date(),
      );

      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(
        presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id), deps.publicBaseUrl, null),
      );
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
      return reply.send(
        presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id), deps.publicBaseUrl, null),
      );
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
      return reply.send(
        presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id), deps.publicBaseUrl, null),
      );
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
      const outcome = await clearVotes(db, request.params.id, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(
        presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id), deps.publicBaseUrl, null),
      );
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
          422: shareImageErrorResponseSchema,
          429: rateLimitedResponseSchema,
        },
      },
      [rateLimitByVoter(deps.imageUploadRateLimiter)],
    ),
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(422).send({ error: 'no file uploaded' });
      }
      const buffer = await file.toBuffer();
      const outcome = await setShareImage(
        db,
        deps.storage,
        {
          warId: request.params.id,
          voterId: request.voterId!,
          buffer,
          mimeType: file.mimetype,
          originalExt: extensionFor(file.mimetype),
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentWarSummary(outcome.value, new Date(), await countContestantsForWar(db, outcome.value.id), deps.publicBaseUrl, null));
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
    bearerAuthRoute(auth, { response: { 204: {}, 403: errorResponseSchema, 404: errorResponseSchema } }, [requireModeratorOrAdmin(db)]),
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
