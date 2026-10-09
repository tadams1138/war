import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { beginLogin, completeCallback, exchangeAuthorizationCode, logout, refresh, type AuthDependencies } from './authService.js';
import { bearerAuthRoute } from './plugin.js';
import { errorResponseSchema } from '../shared/httpOutcomes.js';
import { rateLimitByAddress, rateLimitedResponseSchema, type RateLimiter } from '../shared/rateLimit.js';

const REFRESH_COOKIE = 'refresh_token';
const STATE_COOKIE = 'oauth_state';
const PKCE_COOKIE = 'oauth_pkce';
const AUTH_COOKIE_PATH = '/api/v1/auth';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

/** The body of a declined authorization (§5.1). */
export interface OAuthDeclinedView {
  error: 'authorization declined';
  reason: string;
}

/** `reason` passes the provider's `error` parameter through verbatim, so it is not a closed enum. */
export const oauthDeclinedResponseSchema = {
  type: 'object',
  required: ['error', 'reason'],
  properties: {
    error: { type: 'string' },
    reason: { type: 'string' },
  },
};

/** The callback's 403 is a declined authorization (`reason` set). */
const callbackForbiddenResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' }, reason: { type: 'string' } },
};

/** The address-keyed limit as a preHandler list, empty while address limits are off. */
function addressLimit(limiter: RateLimiter | undefined) {
  return limiter ? [rateLimitByAddress(limiter)] : [];
}

export interface AuthRouteConfig {
  uiOrigins: string[];
  apiBaseUrl: string;
  /** Per-client-address limit on starting sign-in (§8.4: 10/minute); absent while address limits are off. */
  signInRateLimiter?: RateLimiter;
  /** Per-client-address limit on token refresh (§8.4: 30/minute); absent while address limits are off. */
  tokenRefreshRateLimiter?: RateLimiter;
}

/** Every provider's callback lives at the same path shape, so the redirect_uri is derived, not configured. */
function redirectUriFor(apiBaseUrl: string, providerSlug: string): string {
  return `${apiBaseUrl}/api/v1/auth/${providerSlug}/callback`;
}

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: AUTH_COOKIE_PATH,
  };
}

function clearOAuthCookies(reply: FastifyReply): void {
  void reply.clearCookie(STATE_COOKIE, { path: AUTH_COOKIE_PATH });
  void reply.clearCookie(PKCE_COOKIE, { path: AUTH_COOKIE_PATH });
}

// The state and PKCE cookies are set and cleared together, so a mismatch or absence of either is one failure mode.
function resolveCallbackCodeVerifier(
  expectedState: string | undefined,
  state: string | undefined,
  codeVerifier: string | undefined,
): string | null {
  if (!expectedState || !state || expectedState !== state || !codeVerifier) return null;
  return codeVerifier;
}

type CallbackRoute = {
  Params: { provider: string };
  Querystring: { code?: string; state?: string; error?: string };
};

type CallbackValidation =
  | { kind: 'declined'; reason: string }
  | { kind: 'missingCode' }
  | { kind: 'stateMismatch' }
  | { kind: 'ok'; code: string; codeVerifier: string };

/** The callback failure checks of §5.1, in order: a declined authorization is checked before, and independently of, state validation. */
function validateCallbackRequest(request: FastifyRequest<CallbackRoute>): CallbackValidation {
  const { code, state, error } = request.query;

  // A declined authorization is checked first and independent of the state cookie: no code is exchanged on this
  // branch, so there is nothing for state validation to protect. An empty `error` (`?error=`) counts as absent.
  if (error) return { kind: 'declined', reason: error };
  if (!code) return { kind: 'missingCode' };

  const expectedState = request.cookies[STATE_COOKIE];
  const codeVerifier = resolveCallbackCodeVerifier(expectedState, state, request.cookies[PKCE_COOKIE]);
  if (!codeVerifier) {
    return { kind: 'stateMismatch' };
  }
  return { kind: 'ok', code, codeVerifier };
}

function sendCallbackValidationFailure(
  reply: FastifyReply,
  validation: Exclude<CallbackValidation, { kind: 'ok' }>,
) {
  if (validation.kind === 'declined') {
    const body: OAuthDeclinedView = { error: 'authorization declined', reason: validation.reason };
    return reply.code(403).send(body);
  }
  if (validation.kind === 'missingCode') {
    return reply.code(400).send({ error: 'missing code' });
  }
  return reply.code(400).send({ error: 'state mismatch' });
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDependencies, config: AuthRouteConfig): void {
  app.get<{ Params: { provider: string } }>(
    '/auth/:provider/login',
    // Success is a bare 302 redirect; an unsupported provider's 404 has no body.
    { schema: { response: { 404: {}, 429: rateLimitedResponseSchema } }, preHandler: addressLimit(config.signInRateLimiter) },
    async (request, reply) => {
      const provider = deps.providers.get(request.params.provider);
      if (!provider) {
        return reply.code(404).send();
      }
      const redirectUri = redirectUriFor(config.apiBaseUrl, provider.slug);
      const { state, codeVerifier, authorizationUrl } = await beginLogin(provider, redirectUri);
      void reply.setCookie(STATE_COOKIE, state, { ...authCookieOptions(), maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS });
      void reply.setCookie(PKCE_COOKIE, codeVerifier, { ...authCookieOptions(), maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS });
      return reply.redirect(authorizationUrl);
    },
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/:provider/callback',
    // Success is a redirect with no body; the failures are the table checked in order by `validateCallbackRequest`.
    { schema: { response: { 400: errorResponseSchema, 403: callbackForbiddenResponseSchema, 502: errorResponseSchema } } },
    async (request, reply) => {
      const provider = deps.providers.get(request.params.provider);
      if (!provider) {
        return reply.code(404).send();
      }

      const validation = validateCallbackRequest(request);
      if (validation.kind !== 'ok') {
        clearOAuthCookies(reply);
        return sendCallbackValidationFailure(reply, validation);
      }
      const { codeVerifier } = validation;

      // The provider's callback query verbatim (RFC 9207's `iss` and the rest), which the token-exchange library
      // validates off this URL. Origin and path come from `redirectUriFor`, as in the login leg, so nothing off
      // the request line can steer them.
      const redirectUri = redirectUriFor(config.apiBaseUrl, provider.slug);
      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = new URL(request.url, redirectUri).search;

      // Only this exchange is the 502 boundary; a failure in completeCallback (voter upsert, token issuance) stays a 500.
      const exchange = await exchangeAuthorizationCode(provider, { callbackUrl, codeVerifier });
      if (exchange.kind === 'exchangeFailed') {
        // The 502 body stays vague; the real cause goes to the server log.
        request.log.error({ err: exchange.cause }, `${provider.slug} code exchange failed`);
        clearOAuthCookies(reply);
        return reply.code(502).send({ error: `authentication with ${provider.slug} failed` });
      }
      const result = await completeCallback(deps, provider.slug, exchange.profile);
      if (result.kind === 'banned') {
        clearOAuthCookies(reply);
        // Not JSON: the browser is mid-navigation, so send it to the UI, which renders the ban.
        return reply.redirect(`${config.uiOrigins[0]}/auth/callback?error=banned`);
      }

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, authCookieOptions());
      clearOAuthCookies(reply);

      // No token of any kind in the redirect.
      return reply.redirect(`${config.uiOrigins[0]}/auth/callback`);
    },
  );

  app.post(
    '/auth/refresh',
    {
      preHandler: addressLimit(config.tokenRefreshRateLimiter),
      schema: {
        response: {
          200: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: rateLimitedResponseSchema,
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

      void reply.setCookie(REFRESH_COOKIE, result.refreshTokenValue, authCookieOptions());
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
              required: ['id', 'display_name', 'avatar_url', 'is_moderator', 'is_admin'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                display_name: { type: ['string', 'null'] },
                avatar_url: { type: ['string', 'null'] },
                is_moderator: { type: 'boolean' },
                is_admin: { type: 'boolean' },
              },
            },
          },
        },
      },
    }),
    async (request, reply) => {
      const voter = request.voter;
      if (!voter) {
        throw new Error('authenticated voter no longer exists');
      }
      return reply.send({
        voter: {
          id: voter.id,
          display_name: voter.displayName,
          avatar_url: voter.avatarUrl,
          is_moderator: voter.isModerator,
          is_admin: voter.isAdmin,
        },
      });
    },
  );
}
