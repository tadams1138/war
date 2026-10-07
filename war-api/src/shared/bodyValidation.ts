import type { FastifyReply, FastifyRequest } from 'fastify';

interface AjvIssue {
  instancePath?: string;
  message?: string;
  params?: { missingProperty?: string };
}

/** One human-readable line per schema violation, e.g. `category must NOT have more than 64 characters`. */
function describeIssue(issue: AjvIssue): string {
  const missing = issue.params?.missingProperty;
  if (missing) return `${missing} is required`;
  const field = (issue.instancePath ?? '').replace(/^\//, '');
  return `${field} ${issue.message ?? 'is invalid'}`.trim();
}

/**
 * Route option that makes a failed JSON-schema check reach the handler chain
 * as `request.validationError` instead of Fastify's own 400 envelope, so
 * {@link rejectInvalidBody} can answer with this API's 422 validation shape.
 */
export const reportSchemaViolations = { attachValidation: true } as const;

/**
 * A preHandler turning a schema violation (see {@link reportSchemaViolations})
 * into the `{ error: 'validation error', details }` 422 every service-level
 * validation failure already uses. Register it after authentication so an
 * unauthenticated caller still gets 401 first.
 */
export async function rejectInvalidBody(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const failure = request.validationError;
  if (!failure) return;
  const issues = (failure.validation ?? []) as AjvIssue[];
  const details = issues.map(describeIssue);
  await reply.code(422).send({ error: 'validation error', details });
}
