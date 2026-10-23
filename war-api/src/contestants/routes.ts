import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { sendOutcome, failureResponses, editFailureResponses } from '../shared/httpOutcomes.js';
import { reportSchemaViolations, rejectInvalidBody } from '../shared/bodyValidation.js';
import { rateLimitByVoter, rateLimitedResponseSchema, type RateLimiter } from '../shared/rateLimit.js';
import type { ObjectStorage } from './storage.js';
import { callerOf } from '../wars/warAccess.js';
import { addContestant, patchContestant, removeContestant } from './contestantsService.js';
import { addContestantImage, reorderContestantMedia, removeContestantMedia } from './mediaService.js';
import { listMediaByContestant } from './contestantMediaRepository.js';
import { presentContestant } from './contestantPresenter.js';
import { readUploadedFile, sendNoFileUploaded, uploadErrorResponseSchema } from './uploadRequest.js';

export interface ContestantsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  storage: ObjectStorage;
  publicBaseUrl: string;
  /** Per-voter image-upload limit (§8.4: 100/hour). */
  rateLimiter: RateLimiter;
}

/** The `201` body of an image upload: only the assigned id and order, since the caller already holds the file. */
const imageUploadResponseSchema = {
  type: 'object',
  required: ['id', 'display_order'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    display_order: { type: 'integer' },
  },
};

export function registerContestantsRoutes(app: FastifyInstance, deps: ContestantsRouteDeps): void {
  const { db, auth } = deps;

  app.post<{ Params: { id: string }; Body: { name: string; bio?: string | null } }>(
    '/wars/:id/contestants',
    {
      ...reportSchemaViolations,
      ...bearerAuthRoute(
        auth,
        {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              bio: { type: ['string', 'null'] },
            },
          },
          response: {
            201: { $ref: 'ContestantDetail#' },
            ...editFailureResponses,
          },
        },
        [rejectInvalidBody],
      ),
    },
    async (request, reply) => {
      const { name, bio } = request.body;
      const outcome = await addContestant(db, { warId: request.params.id, caller: callerOf(request), name, bio });
      return sendOutcome(reply, outcome, async (value) => {
        const media = await listMediaByContestant(db, value.id);
        return reply.code(201).send(presentContestant(value, media, deps.publicBaseUrl));
      });
    },
  );

  app.patch<{ Params: { id: string; cId: string }; Body: { name?: string; bio?: string | null } }>(
    '/wars/:id/contestants/:cId',
    bearerAuthRoute(auth, {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          bio: { type: ['string', 'null'] },
        },
      },
      response: {
        200: { $ref: 'ContestantDetail#' },
        ...editFailureResponses,
      },
    }),
    async (request, reply) => {
      const { name, bio } = request.body;
      const outcome = await patchContestant(db, request.params.id, request.params.cId, callerOf(request), { name, bio });
      return sendOutcome(reply, outcome, async (value) => {
        const media = await listMediaByContestant(db, value.id);
        return reply.send(presentContestant(value, media, deps.publicBaseUrl));
      });
    },
  );

  app.delete<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const outcome = await removeContestant(db, deps.storage, request.log, request.params.id, request.params.cId, callerOf(request));
      return sendOutcome(reply, outcome, () => reply.code(204).send());
    },
  );

  app.post<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId/images',
    bearerAuthRoute(
      auth,
      {
        response: {
          201: imageUploadResponseSchema,
          ...failureResponses,
          422: uploadErrorResponseSchema,
          429: rateLimitedResponseSchema,
        },
      },
      [rateLimitByVoter(deps.rateLimiter)],
    ),
    async (request, reply) => {
      const upload = await readUploadedFile(request);
      if (!upload) {
        return sendNoFileUploaded(reply);
      }
      const outcome = await addContestantImage(db, deps.storage, request.log, {
        warId: request.params.id,
        contestantId: request.params.cId,
        caller: callerOf(request),
        ...upload,
      });
      return sendOutcome(reply, outcome, (value) => reply.code(201).send({ id: value.id, display_order: value.displayOrder }));
    },
  );

  app.patch<{ Params: { id: string; cId: string; mId: string }; Body: { display_order: number } }>(
    '/wars/:id/contestants/:cId/media/:mId',
    {
      ...reportSchemaViolations,
      ...bearerAuthRoute(
        auth,
        {
          body: {
            type: 'object',
            required: ['display_order'],
            properties: { display_order: { type: 'integer' } },
          },
          response: {
            204: {},
            ...editFailureResponses,
          },
        },
        [rejectInvalidBody],
      ),
    },
    async (request, reply) => {
      const outcome = await reorderContestantMedia(
        db,
        request.params.id,
        request.params.cId,
        request.params.mId,
        callerOf(request),
        request.body.display_order,
      );
      return sendOutcome(reply, outcome, () => reply.code(204).send());
    },
  );

  app.delete<{ Params: { id: string; cId: string; mId: string } }>(
    '/wars/:id/contestants/:cId/media/:mId',
    bearerAuthRoute(auth, {
      response: {
        204: {},
        ...failureResponses,
      },
    }),
    async (request, reply) => {
      const outcome = await removeContestantMedia(
        db,
        deps.storage,
        request.log,
        request.params.id,
        request.params.cId,
        request.params.mId,
        callerOf(request),
      );
      return sendOutcome(reply, outcome, () => reply.code(204).send());
    },
  );
}
