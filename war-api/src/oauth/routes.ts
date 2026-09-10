import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import type { FastifyInstance } from 'fastify';
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js';
import type { WarOAuthServerProvider } from './provider.js';

/**
 * Mounts the OAuth 2.1 authorization server's own routes (spec §4.3.2,
 * §4.3.4) at `${apiPrefix}/oauth/authorize` and `${apiPrefix}/oauth/token`,
 * via `@fastify/express`'s `fastify.use(path, middleware)`.
 *
 * **Must be called on the top-level app, with the full absolute path baked
 * in — never inside a `{ prefix }`-registered child, and never with a
 * path relying on that child's own prefix to be applied automatically.**
 * This is not a style preference: `@fastify/express` gives every
 * encapsulated child its *own* separate internal Express instance
 * (`onRegister` in its source), but the onRequest hook that actually
 * dispatches to Express only runs with `this` bound to whichever
 * encapsulated context owns the *matched Fastify route* for a request —
 * and an Express-only path matches no Fastify route at all. A request to
 * such a path therefore falls through to Fastify's default not-found
 * handling, which runs with the **root** app's own hooks and its own
 * (separate, empty) Express instance — never the child's. Confirmed
 * empirically before writing this: mounting inside the same `{ prefix:
 * API_PREFIX }` block every other route lives in (either registering
 * `@fastify/express` there too, or just calling `instance.use(...)`) 404s
 * every time; mounting on the root with the full path does not. Practical
 * effect: register `@fastify/express` once on the top-level app (`app.ts`),
 * and call this function on that same top-level app, not on the `instance`
 * passed into the `{ prefix: API_PREFIX }` block the rest of the routes
 * share.
 *
 * Uses the MCP SDK's `authorizationHandler`/`tokenHandler` directly rather
 * than the bundled `mcpAuthRouter` (spec §4.3.1): that router assumes
 * mounting at the application root and hardcodes `/register`/`/revoke`
 * alongside `/authorize`/`/token`, which would need Dynamic Client
 * Registration wired in before slice 3 builds it. The two handlers used
 * here are the actual wire-protocol logic (PKCE orchestration, parameter
 * validation, error formatting) this API delegates to the SDK; only the
 * discovery documents (`src/oauth/metadata.ts`) are hand-assembled, and only
 * because the SDK's own metadata builder cannot place its hardcoded
 * root-relative endpoint paths under this prefix (see that file's comment).
 */
export function registerOAuthAsRoutes(app: FastifyInstance, apiPrefix: string, provider: WarOAuthServerProvider): void {
  app.use(`${apiPrefix}/oauth/authorize`, authorizationHandler({ provider, rateLimit: false }));
  app.use(`${apiPrefix}/oauth/token`, tokenHandler({ provider, rateLimit: false }));
}

/**
 * Mounts the two RFC 8414 / RFC 9728 discovery documents (spec §4.3.5) at
 * the fixed, unprefixed `/.well-known/*` locations both RFCs require —
 * discoverable without any prior knowledge of this API's own `/api/v1`
 * routing, which is the entire point of a "well-known" URI. Must be
 * registered on the top-level app, never inside the `/api/v1` prefix block.
 */
export function registerOAuthDiscoveryRoutes(app: FastifyInstance, apiBaseUrl: string): void {
  app.get('/.well-known/oauth-authorization-server', { schema: { hide: true } }, async (_request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return reply.send(authorizationServerMetadata(apiBaseUrl));
  });

  app.get('/.well-known/oauth-protected-resource', { schema: { hide: true } }, async (_request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return reply.send(protectedResourceMetadata(apiBaseUrl));
  });
}
