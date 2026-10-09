/**
 * Fastify's request-log serializer, stripped of the query string. A
 * provider's one-time OAuth `code`/`state` values live there on the
 * callback route (this app's own tokens never appear in a URL), so this keeps a method+path+status+timing
 * trail in the logs without ever writing one of those values to it.
 */
export function redactedRequestSerializer(request: { method: string; url: string }): { method: string; url: string } {
  return {
    method: request.method,
    url: request.url.split('?')[0]!,
  };
}
