import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import type { FastifyInstance } from 'fastify';
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js';
import { mcpResourceIdentifier } from './resource.js';
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
 *
 * **Rate limiting is left at the SDK's own default** (design review of
 * 513ee16, Finding 4): `rateLimit: false` made `GET /oauth/authorize` an
 * unauthenticated, unthrottled instruction for this API to make a DNS
 * lookup plus an HTTPS GET against any host an attacker names (`client_id`
 * is client-supplied, §4.3.3) — a reflected-request amplifier and a
 * host/port prober via response timing, reachable by nobody's credentials
 * at all. Neither handler is passed `rateLimit` here, so each applies its
 * own built-in `express-rate-limit` (100 req/15 min for `/oauth/authorize`,
 * 50 req/15 min for `/oauth/token`, both keyed by `request.ip`) rather than
 * this API hand-rolling a second limiter for two routes the SDK already
 * throttles correctly out of the box. **Known limitation, not fixed here**:
 * `request.ip`'s accuracy behind App Platform's own ingress depends on the
 * bridged Express instance's `trust proxy` setting, which this slice does
 * not configure (no App Platform proxy-chain depth is documented in
 * war-infra-spec.md to configure it correctly against) — until that
 * infrastructure detail is pinned down, every client behind the same
 * ingress hop may share one bucket rather than being limited individually.
 * That is strictly better than the unthrottled state this closes: a shared
 * bucket still bounds worst-case amplification/probing traffic, just not
 * with per-client precision.
 */
export function registerOAuthAsRoutes(app: FastifyInstance, apiPrefix: string, provider: WarOAuthServerProvider): void {
  if (app.prefix !== '') {
    // Design review of 513ee16, Finding 8(a): calling this on a
    // `{ prefix }`-registered child 404s every request silently, with the
    // reason living only in the comment above -- fail loudly, at
    // registration time, instead of leaving the next person to add an
    // Express-only route here to rediscover the trap by request-time 404.
    throw new Error(
      `registerOAuthAsRoutes must be called on the top-level app, not an instance with its own prefix ("${app.prefix}") -- see this function's own doc comment`,
    );
  }
  app.use(`${apiPrefix}/oauth/authorize`, authorizationHandler({ provider }));
  app.use(`${apiPrefix}/oauth/token`, tokenHandler({ provider }));
}

/**
 * Mounts the two RFC 8414 / RFC 9728 discovery documents (spec §4.3.5) at
 * the fixed, unprefixed `/.well-known/*` locations both RFCs require —
 * discoverable without any prior knowledge of this API's own `/api/v1`
 * routing, which is the entire point of a "well-known" URI. Must be
 * registered on the top-level app, never inside the `/api/v1` prefix block.
 *
 * The RFC 9728 document is served at the resource-identifier-suffixed path
 * (`/.well-known/oauth-protected-resource/api/v1/mcp`), never the bare
 * `/.well-known/oauth-protected-resource` — RFC 9728 §3.1 requires the
 * suffix whenever the resource identifier carries a path component, which
 * `${PUBLIC_BASE_URL}/api/v1/mcp` does (spec §4.3.5; design review Finding 6
 * of 513ee16 caught the original bare-path version of this route as a spec
 * defect, since fixed at the spec). The suffix is derived from
 * {@link mcpResourceIdentifier} itself, not a second hardcoded literal, so
 * the two cannot drift apart.
 */
export function registerOAuthDiscoveryRoutes(app: FastifyInstance, apiBaseUrl: string): void {
  app.get('/.well-known/oauth-authorization-server', { schema: { hide: true } }, async (_request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return reply.send(authorizationServerMetadata(apiBaseUrl));
  });

  const protectedResourcePath = new URL(mcpResourceIdentifier(apiBaseUrl)).pathname;
  app.get(`/.well-known/oauth-protected-resource${protectedResourcePath}`, { schema: { hide: true } }, async (_request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return reply.send(protectedResourceMetadata(apiBaseUrl));
  });
}
