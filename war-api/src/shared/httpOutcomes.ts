import type { FastifyReply } from 'fastify';
import type { Forbidden, NotActive, NotDraft, NotFound, ValidationError } from './outcomes.js';

/** Every non-'ok' outcome kind a domain service in this codebase returns. */
export type HttpFailure = NotFound | Forbidden | NotDraft | NotActive | ValidationError;

/**
 * The response body JSON Schema for the `{ "error": string }` shape every
 * failure response in the Core Voting Loop slice uses (spec) --
 * including, but not limited to, the ones `replyForOutcome` itself sends.
 * Not `$id`-registered: shared by direct import/`$ref`-by-object rather
 * than by name, since no route needs to reference it before it exists.
 */
export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
};

/**
 * The response body JSON Schema for the `{ "error": string, "details":
 * string[] }` shape a `'validationError'` outcome sends (spec) --
 * `error` is always the literal `"validation error"`; `details` carries the
 * actual per-field messages. Shared by every route whose `replyForOutcome`
 * call can reach the `validationError` branch above; not every 422 in this
 * codebase uses it (`POST /wars/:id/contestants/:cId/images`'s 422 is a
 * plain `errorResponseSchema` -- see that route's own comment).
 */
export const validationErrorResponseSchema = {
  type: 'object',
  required: ['error', 'details'],
  properties: {
    error: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Status and message per outcome kind, keyed by `HttpFailure['kind']` --
 * `Record` requires every key present, so an outcome kind added to the
 * union without an entry here is a compile error, the same exhaustiveness
 * guarantee a `never`-typed switch default gave (design review finding 7),
 * without one `case` per kind driving this function's own branch count up.
 */
const STATUS_BY_KIND: Record<HttpFailure['kind'], number> = {
  notFound: 404,
  forbidden: 403,
  notDraft: 403,
  notActive: 403,
  validationError: 422,
};

const MESSAGE_BY_KIND: Record<HttpFailure['kind'], string> = {
  notFound: 'not found',
  forbidden: 'forbidden',
  notDraft: 'War is no longer editable',
  notActive: 'War is not active',
  validationError: 'validation error',
};

/**
 * Maps a failed `MutationOutcome` (or any of the bespoke unions built from
 * the same failure variants) to its HTTP response. Takes the whole outcome
 * so it reads `errors` itself — callers no longer repeat
 * `'errors' in outcome ? outcome.errors : undefined`.
 */
export function replyForOutcome(reply: FastifyReply, outcome: HttpFailure): FastifyReply {
  const body: { error: string; details?: string[] } = { error: MESSAGE_BY_KIND[outcome.kind] };
  if (outcome.kind === 'validationError') body.details = outcome.errors;
  return reply.code(STATUS_BY_KIND[outcome.kind]).send(body);
}
