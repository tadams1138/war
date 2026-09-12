import type { FastifyInstance } from 'fastify';
import { beginLogin, completeCallback, currentVoter, exchangeAuthorizationCode, logout, refresh, type AuthDependencies } from './authService.js';
import { bearerAuthRoute } from './plugin.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';

const REFRESH_COOKIE = 'refresh_token';
const STATE_COOKIE = 'oauth_state';
const PKCE_COOKIE = 'oauth_pkce';
const AUTH_COOKIE_PATH = '/api/v1/auth';

/** The `{ error, reason }` body check #1 of the spec's "Callback failure responses" table returns. */
export interface OAuthDeclinedView {
  error: 'authorization declined';
  reason: string;
}

/**
 * Unlike `voteForbiddenResponseSchema` (matchups/routes.ts), `reason` here
 * is not a closed `enum`: spec passes the OAuth provider's `error`
 * parameter through verbatim, since the set of codes a provider can send is
 * not this API's vocabulary to close off.
 */
export const oauthDeclinedResponseSchema = {
  type: 'object',
  required: ['error', 'reason'],
  properties: {
    error: { type: 'string' },
    reason: { type: 'string' },
  },
};

export interface AuthRouteConfig {
  uiOrigins: string[];
  apiBaseUrl: string;
}

/** Every provider's callback lives at the same path shape, so the redirect_uri is derived, not configured. */
function redirectUriFor(apiBaseUrl: string, providerSlug: string): string {
  return `${apiBaseUrl}/api/v1/auth/${providerSlug}/callback`;
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: AUTH_COOKIE_PATH,
  };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDependencies, config: AuthRouteConfig): void {
  app.get<{ Params: { provider: string } }>(
    '/auth/:provider/login',
    // Success is a bare 302 redirect (no body); the only bodied outcome is
    // an unsupported provider's 404 (spec, discrepancy 2: "confirmed
    // redirect-or-empty-404 only -- no body to schema on that route").
    { schema: { response: { 404: {} } } },
    async (request, reply) => {
      const provider = deps.providers.get(request.params.provider);
      if (!provider) {
        return reply.code(404).send();
      }
      const redirectUri = redirectUriFor(config.apiBaseUrl, provider.slug);
      const { state, codeVerifier, authorizationUrl } = await beginLogin(deps, provider, redirectUri);
      void reply.setCookie(STATE_COOKIE, state, { ...refreshCookieOptions(), maxAge: 600 });
      void reply.setCookie(PKCE_COOKIE, codeVerifier, { ...refreshCookieOptions(), maxAge: 600 });
      return reply.redirect(authorizationUrl);
    },
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/:provider/callback',
    // Success is a redirect with no body (spec, discrepancy 1: the
    // stale 200-body example is superseded by the spec's cookie flow).
    // The four failure responses are the spec's "Callback failure
    // responses" table, checked in that exact order below.
    { schema: { response: { 400: errorResponseSchema, 403: oauthDeclinedResponseSchema, 502: errorResponseSchema } } },
    async (request, reply) => {
      const provider = deps.providers.get(request.params.provider);
      if (!provider) {
        return reply.code(404).send();
      }
      const { code, state, error } = request.query;

      // #1 -- the provider declined to grant what was asked (spec).
      // Checked first and independent of the state cookie: no code is ever
      // exchanged on this branch, so there is nothing for state validation
      // to protect. An empty `error` (`?error=`) is treated as absent.
      if (error) {
        const body: OAuthDeclinedView = { error: 'authorization declined', reason: error };
        void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
        void reply.clearCookie(PKCE_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(403).send(body);
      }

      if (!code) {
        void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
        void reply.clearCookie(PKCE_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(400).send({ error: 'missing code' });
      }
      const expectedState = request.cookies[STATE_COOKIE];
      const codeVerifier = request.cookies[PKCE_COOKIE];
      // The state and PKCE cookies are always set and cleared together, so
      // a mismatch or an absence of either is one failure mode, not two:
      // there is nothing safe to exchange without both.
      if (!expectedState || !state || expectedState !== state || !codeVerifier) {
        void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
        void reply.clearCookie(PKCE_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(400).send({ error: 'state mismatch' });
      }

      // The provider's real callback query, verbatim -- RFC 9207's `iss` and the rest,
      // which the token-exchange library validates straight off this URL. The
      // origin and path come from `redirectUriFor`, the same pure function the
      // login leg above calls with the same provider slug, so the two legs
      // cannot diverge for a given provider and nothing off the request line
      // can steer them.
      const redirectUri = redirectUriFor(config.apiBaseUrl, provider.slug);
      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = new URL(request.url, redirectUri).search;

      // #4 -- the error boundary is scoped to the exchange call alone
      // (spec). Whatever completeCallback does afterwards (voter upsert,
      // refresh-token issuance) runs outside this check, so a failure there
      // keeps surfacing as an unmapped 500, exactly as before.
      const exchange = await exchangeAuthorizationCode(deps, provider, { callbackUrl, codeVerifier, redirectUri });
      if (exchange.kind === 'exchangeFailed') {
        // The 502 body stays deliberately vague (spec: none of this
        // is safe to show verbatim) -- but the real cause is still worth a
        // server-side record, which `request.log` now actually is (see
        // app.ts's logger config).
        request.log.error({ err: exchange.cause }, `${provider.slug} code exchange failed`);
        void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
        void reply.clearCookie(PKCE_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(502).send({ error: `authentication with ${provider.slug} failed` });
      }
      const result = await completeCallback(deps, provider.slug, exchange.profile);

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, refreshCookieOptions());
      void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
      void reply.clearCookie(PKCE_COOKIE, { path: AUTH_COOKIE_PATH });

      // No token of any kind in the redirect (spec).
      return reply.redirect(`${config.uiOrigins[0]}/auth/callback`);
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        response: {
          200: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (!origin || !config.uiOrigins.includes(origin)) {
        return reply.code(403).send({ error: 'origin not allowed' });
      }

      const presented = request.cookies[REFRESH_COOKIE];
      if (!presented) {
        return reply.code(401).send({ error: 'no refresh token' });
      }

      const result = await refresh(deps, presented);
      if (result.kind !== 'refreshed') {
        void reply.clearCookie(REFRESH_COOKIE, { path: AUTH_COOKIE_PATH });
        return reply.code(401).send({ error: 'invalid refresh token' });
      }

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, refreshCookieOptions());
      return reply.send({ token: result.jwt });
    },
  );

  app.delete(
    '/auth/session',
    bearerAuthRoute(deps, { response: { 204: {} } }),
    async (request, reply) => {
      const presented = request.cookies[REFRESH_COOKIE];
      await logout(deps, request.voterId!, presented);
      void reply.clearCookie(REFRESH_COOKIE, { path: AUTH_COOKIE_PATH });
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/me',
    bearerAuthRoute(deps, {
      response: {
        200: {
          type: 'object',
          required: ['voter'],
          properties: {
            voter: {
              type: 'object',
              required: ['id', 'display_name', 'avatar_url'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                display_name: { type: ['string', 'null'] },
                avatar_url: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    }),
    async (request, reply) => {
      const voter = await currentVoter(deps, request.headers.authorization);
      return reply.send({
        voter: { id: voter.id, display_name: voter.displayName, avatar_url: voter.avatarUrl },
      });
    },
  );
}
