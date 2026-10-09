import type { FastifyReply } from 'fastify';
import type { Forbidden, NotFound, NotPublished, ValidationError } from './outcomes.js';

/** Every non-'ok' outcome kind a domain service returns. */
export type HttpFailure = NotFound | Forbidden | NotPublished | ValidationError;

/** The response body JSON Schema for the `{ "error": string }` shape that failure responses use. */
export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
};

/**
 * The response body JSON Schema for the `{ "error": "validation error", "details": string[] }` shape a
 * `validationError` outcome sends, `details` carrying the per-field messages.
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
 * Status and message per outcome kind. `Record` requires every key, so a kind added to the union without an
 * entry here is a compile error.
 */
const STATUS_BY_KIND: Record<HttpFailure['kind'], number> = {
  notFound: 404,
  forbidden: 403,
  notPublished: 403,
  validationError: 422,
};

const MESSAGE_BY_KIND: Record<HttpFailure['kind'], string> = {
  notFound: 'not found',
  forbidden: 'forbidden',
  notPublished: 'War is not published',
  validationError: 'validation error',
};

/**
 * The status and body a failed outcome maps to. Routes whose responses carry more than this (the vote route's
 * `reason`, the rankings cache headers) build theirs from this for the failures they share.
 */
export function failureResponse(outcome: HttpFailure): { status: number; body: { error: string; details?: string[] } } {
  const body: { error: string; details?: string[] } = { error: MESSAGE_BY_KIND[outcome.kind] };
  if (outcome.kind === 'validationError') body.details = outcome.errors;
  return { status: STATUS_BY_KIND[outcome.kind], body };
}

/** Sends a failed `MutationOutcome` (or any union built from the same failure variants) as its HTTP response. */
export function replyForOutcome(reply: FastifyReply, outcome: HttpFailure): FastifyReply {
  const { status, body } = failureResponse(outcome);
  return reply.code(status).send(body);
}

/** The 404 every route sends for a missing, removed or invisible resource. */
export function sendNotFound(reply: FastifyReply): FastifyReply {
  return replyForOutcome(reply, { kind: 'notFound' });
}
