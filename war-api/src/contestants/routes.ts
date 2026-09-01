import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema, replyForOutcome, validationErrorResponseSchema } from '../shared/httpOutcomes.js';
import type { ObjectStorage } from './storage.js';
import { addContestant, patchContestant, removeContestant } from './contestantsService.js';
import { addContestantImage, reorderContestantMedia, removeContestantMedia } from './mediaService.js';
import { listMediaByContestant } from './contestantMediaRepository.js';
import { presentContestant } from './contestantPresenter.js';

export interface ContestantsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
  storage: ObjectStorage;
  publicBaseUrl: string;
}

/**
 * The response body JSON Schema for `POST /wars/:id/contestants/:cId/images`'s
 * `201` (spec §11.2.1) — the route's own literal `{ id, display_order }`
 * object, narrower than the full `MediaItem` shape: the caller already has
 * the file it just uploaded and needs only the assigned id and order back.
 */
const imageUploadResponseSchema = {
  type: 'object',
  required: ['id', 'display_order'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    display_order: { type: 'integer' },
  },
};

/**
 * The response body JSON Schema for `POST /wars/:id/contestants/:cId/images`'s
 * `422` (spec §11.2.1) -- this route's own three validation failures produce
 * two distinct shapes sharing this one status: the no-file case sends a
 * plain `{ error }`, while the too-many-images and unreadable-upload cases
 * go through `replyForOutcome`'s validationError branch and send
 * `{ error, details }`. Neither `errorResponseSchema` (no `details`
 * property, so it silently drops the second shape's only actionable text)
 * nor `validationErrorResponseSchema` (`details` required, so it rejects the
 * first shape) fits both -- this schema requires only `error` and leaves
 * `details` optional, scoped to this one route's 422 rather than shared.
 */
const imageUploadErrorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
  },
};

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export function registerContestantsRoutes(app: FastifyInstance, deps: ContestantsRouteDeps): void {
  const { db, auth } = deps;

  app.post<{ Params: { id: string } }>(
    '/wars/:id/contestants',
    bearerAuthRoute(auth, {
      response: {
        201: { $ref: 'ContestantDetail#' },
        403: errorResponseSchema,
        404: errorResponseSchema,
        422: validationErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await addContestant(
        db,
        {
          warId: request.params.id,
          voterId: request.voterId!,
          name: body.name as string,
          bio: body.bio as string | null | undefined,
          attributes: body.attributes as Record<string, unknown> | undefined,
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      const media = await listMediaByContestant(db, outcome.value.contestant.id);
      const view = presentContestant(outcome.value.contestant, outcome.value.war, media, deps.publicBaseUrl);
      return reply.code(201).send(view);
    },
  );

  app.patch<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await patchContestant(
        db,
        request.params.id,
        request.params.cId,
        request.voterId!,
        {
          name: body.name as string | undefined,
          bio: body.bio as string | null | undefined,
          attributes: body.attributes as Record<string, unknown> | undefined,
        },
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      const media = await listMediaByContestant(db, outcome.value.contestant.id);
      const view = presentContestant(outcome.value.contestant, outcome.value.war, media, deps.publicBaseUrl);
      return reply.send(view);
    },
  );

  app.delete<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const outcome = await removeContestant(db, request.params.id, request.params.cId, request.voterId!, new Date());
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string; cId: string } }>(
    '/wars/:id/contestants/:cId/images',
    bearerAuthRoute(auth, {
      response: {
        201: imageUploadResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        // Not errorResponseSchema (no `details` property -- strips the
        // validation-error shape's only actionable text) and not
        // validationErrorResponseSchema (`details` required -- rejects the
        // no-file shape, which has none). This route's three 422s produce
        // two distinct bodies sharing the one status (spec §11.2.1); see
        // imageUploadErrorResponseSchema above.
        422: imageUploadErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(422).send({ error: 'no file uploaded' });
      }
      const buffer = await file.toBuffer();
      const outcome = await addContestantImage(
        db,
        deps.storage,
        {
          warId: request.params.id,
          contestantId: request.params.cId,
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
      return reply.code(201).send({
        id: outcome.value.id,
        display_order: outcome.value.displayOrder,
      });
    },
  );

  app.patch<{ Params: { id: string; cId: string; mId: string } }>(
    '/wars/:id/contestants/:cId/media/:mId',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const body = request.body as { display_order?: number };
      const outcome = await reorderContestantMedia(
        db,
        request.params.id,
        request.params.cId,
        request.params.mId,
        request.voterId!,
        body.display_order ?? 0,
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string; cId: string; mId: string } }>(
    '/wars/:id/contestants/:cId/media/:mId',
    bearerAuthRoute(auth),
    async (request, reply) => {
      const outcome = await removeContestantMedia(
        db,
        request.params.id,
        request.params.cId,
        request.params.mId,
        request.voterId!,
        new Date(),
      );
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(204).send();
    },
  );
}
