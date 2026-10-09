import type { FastifyReply, FastifyRequest, FastifySchema } from 'fastify';
import { authenticate, type AuthDependencies } from './authService.js';
import type { Voter } from './votersRepository.js';

declare module 'fastify' {
  interface FastifyRequest {
    voterId?: string;
    /** The authenticated Voter's row, loaded once during authentication so role and state guards need no lookup of their own. */
    voter?: Voter;
  }
}

async function authenticateRequest(deps: AuthDependencies, request: FastifyRequest): Promise<void> {
  const caller = await authenticate(deps, request.headers.authorization);
  request.voterId = caller.voterId;
  request.voter = caller.voter;
}

/** Requires a valid Bearer JWT (§5). Populates `request.voterId` and `request.voter`, or replies 401 without calling the handler. */
export function requireAuth(deps: AuthDependencies) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await authenticateRequest(deps, request);
    } catch {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  };
}

/**
 * {@link requireAuth} only when `shouldRequireAuth` says so, for a route that is public in general but needs
 * identity for one query combination (`GET /wars?creator=me`, §6.1). Unlike {@link bearerAuthRoute}, it does
 * not mark the whole route as requiring auth in the OpenAPI document.
 */
export function requireAuthIf(deps: AuthDependencies, shouldRequireAuth: (request: FastifyRequest) => boolean) {
  const guarded = requireAuth(deps);
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (shouldRequireAuth(request)) {
      await guarded(request, reply);
    }
  };
}

/**
 * Populates `request.voterId` when a valid Bearer JWT is present but never rejects: an absent, malformed or
 * expired token leaves the caller anonymous. For a route that is public but whose response depends on who is
 * asking (`GET /wars/:id`'s `is_owner`, rankings of an invite-only War).
 */
export function optionalAuth(deps: AuthDependencies) {
  return async function preHandler(request: FastifyRequest): Promise<void> {
    try {
      await authenticateRequest(deps, request);
    } catch {
      // No identity available; the route proceeds as an anonymous caller.
    }
  };
}

/**
 * Route options for an endpoint gated by the bearer JWT: the preHandler that enforces it and the OpenAPI marker
 * that documents it, produced together so neither can be added without the other. `extraPreHandlers` run after
 * authentication, in order, so they can rely on `request.voterId` and `request.voter` (role guards, per-voter rate limits).
 */
export function bearerAuthRoute(
  deps: AuthDependencies,
  schema: FastifySchema = {},
  extraPreHandlers: Array<(request: FastifyRequest, reply: FastifyReply) => Promise<void>> = [],
) {
  return { schema: { ...schema, security: [{ bearerAuth: [] }] }, preHandler: [requireAuth(deps), ...extraPreHandlers] };
}
