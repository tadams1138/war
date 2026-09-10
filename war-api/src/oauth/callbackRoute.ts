import type { FastifyInstance } from 'fastify';
import type { AuthDependencies } from '../auth/authService.js';
import { exchangeGoogleCode } from '../auth/authService.js';
import { findOrCreateVoter } from '../auth/votersRepository.js';
import { verifyPendingAuthorization } from './authorizeState.js';
import { AUTHORIZATION_CODE_TTL_MS, generateAuthorizationCode, hashAuthorizationCode } from './authorizationCodes.js';
import { createAuthorizationCode } from './authorizationCodesRepository.js';

export interface OAuthCallbackConfig {
  /** This deployment's own issuer identifier (spec §4.3.2: `iss`, RFC 9207). */
  issuerUrl: string;
  /** The Google-side redirect_uri this flow advertised (must match the leg that started it). */
  googleOAuthRedirectUri: string;
}

/** Appends `error`/`state` (or `code`/`state`/`iss`) to a client redirect_uri, per RFC 6749. */
function withParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.href;
}

/**
 * The OAuth 2.1 authorization server's own Google callback (spec §4.3.2) —
 * a route entirely separate from `src/auth/routes.ts`'s existing
 * `/auth/:provider/callback`, so the browser flow (§4.1) is never touched by
 * this file at all. The third-party request this completes travels as the
 * signed `state` value (`signPendingAuthorization`/`verifyPendingAuthorization`),
 * not as shared server-side state.
 */
export function registerOAuthCallbackRoute(app: FastifyInstance, deps: AuthDependencies, config: OAuthCallbackConfig): void {
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/oauth/google/callback',
    { schema: { hide: true } },
    async (request, reply) => {
      const { code, state, error } = request.query;

      if (!state) {
        return reply.code(400).send({ error: 'missing state' });
      }

      let pending;
      try {
        pending = await verifyPendingAuthorization(state, deps.jwt);
      } catch {
        // An unverifiable state carries no trustworthy redirect target --
        // this must be a direct response, exactly like §4.3.2's own
        // pre-redirect checks (unrecognized client_id/redirect_uri).
        return reply.code(400).send({ error: 'invalid state' });
      }

      if (error) {
        // The provider declined -- same RFC 6749 §4.1.2.1 codes §4.1 #1
        // already passes through verbatim for the browser flow, redirected
        // to the *third-party client's* redirect_uri this time, not the SPA's.
        return reply.redirect(withParams(pending.redirectUri, { error, state: pending.state }));
      }
      if (!code) {
        return reply.redirect(withParams(pending.redirectUri, { error: 'invalid_request', state: pending.state }));
      }

      const callbackUrl = new URL(config.googleOAuthRedirectUri);
      callbackUrl.search = new URL(request.url, config.googleOAuthRedirectUri).search;

      const exchange = await exchangeGoogleCode(deps, { callbackUrl });
      if (exchange.kind === 'exchangeFailed') {
        request.log.error({ err: exchange.cause }, 'google code exchange failed (oauth AS flow)');
        return reply.redirect(withParams(pending.redirectUri, { error: 'server_error', state: pending.state }));
      }

      const { voter } = await findOrCreateVoter(deps.db, 'google', exchange.profile);

      const plaintextCode = generateAuthorizationCode();
      await createAuthorizationCode(deps.db, {
        voterId: voter.id,
        clientId: pending.clientId,
        codeHash: hashAuthorizationCode(plaintextCode),
        codeChallenge: pending.codeChallenge,
        redirectUri: pending.redirectUri,
        resource: pending.resource,
        expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
      });

      return reply.redirect(
        withParams(pending.redirectUri, { code: plaintextCode, state: pending.state, iss: config.issuerUrl }),
      );
    },
  );
}
