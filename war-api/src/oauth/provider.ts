import type { Response } from 'express';
import type { Kysely } from 'kysely';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { InvalidGrantError, InvalidTargetError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { Database } from '../db/types.js';
import type { JwtOptions } from '../auth/jwt.js';
import { signAccessToken, verifyAccessToken as verifyJwt } from '../auth/jwt.js';
import { decideRefresh, generateRefreshTokenValue, hashRefreshToken } from '../auth/refreshTokens.js';
import { createRefreshTokenFamily, findRefreshTokenByHash, revokeFamily, rotateRefreshToken } from '../auth/refreshTokensRepository.js';
import type { GoogleAuthProvider } from '../auth/googleProvider.js';
import { CimdClientStore } from './cimdClientStore.js';
import { signPendingAuthorization } from './authorizeState.js';
import { decoyCodeChallenge, hashAuthorizationCode } from './authorizationCodes.js';
import { claimAuthorizationCode, findClaimedAuthorizationCodeByHash } from './authorizationCodesRepository.js';
import { mcpResourceIdentifier } from './resource.js';

/** True only for exactly this deployment's own MCP resource identifier (spec §4.3.2, §4.3.4). */
export function isCanonicalResource(resource: string | undefined, apiBaseUrl: string): resource is string {
  return resource !== undefined && resource === mcpResourceIdentifier(apiBaseUrl);
}

export interface OAuthProviderDeps {
  db: Kysely<Database>;
  google: GoogleAuthProvider;
  jwt: JwtOptions;
  apiBaseUrl: string;
  /** The Google-side redirect_uri dedicated to this AS flow (spec §4.3.2), distinct from the browser flow's own (§4.1). */
  googleOAuthRedirectUri: string;
  /** Injectable for tests; defaults to the real CIMD resolver (spec §4.3.3). */
  clientsStore?: OAuthRegisteredClientsStore;
}

/**
 * This API's `OAuthServerProvider` implementation (spec §4.3.1's table) —
 * the platform-specific decisions (who a token represents, what it's good
 * for) behind the MCP SDK's wire-protocol handlers.
 */
export class WarOAuthServerProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;

  constructor(private readonly deps: OAuthProviderDeps) {
    this.clientsStore = deps.clientsStore ?? new CimdClientStore();
  }

  /**
   * Validates `resource` (the only check this AS's authorize step owns —
   * client_id/redirect_uri/code_challenge_method are already validated by
   * the SDK's `authorizationHandler` before this runs), then authenticates
   * the human via the **existing, unmodified** Google flow (§4.1): the
   * third-party request's own parameters travel across that round trip as a
   * signed `state` (`signPendingAuthorization`), not as new server-side
   * state, so `src/auth/routes.ts`'s browser callback is never touched.
   */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const resource = params.resource?.href;
    if (!isCanonicalResource(resource, this.deps.apiBaseUrl)) {
      throw new InvalidTargetError('resource must be this deployment\'s own MCP resource identifier');
    }

    const pendingToken = await signPendingAuthorization(
      {
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        resource,
        state: params.state,
      },
      this.deps.jwt,
    );
    const authorizationUrl = await this.deps.google.authorizationUrl({
      state: pendingToken,
      redirectUri: this.deps.googleOAuthRedirectUri,
    });
    res.redirect(authorizationUrl);
  }

  /**
   * Returns the real stored `code_challenge` only for a code that is real,
   * unexpired, unused, and bound to `client` — claiming it (marking it used)
   * in the same call, so a code is burned by its first redemption *attempt*
   * regardless of outcome (spec §6: "used_at ... set on any redemption
   * attempt, success or not"). Any other case returns a decoy challenge
   * (`decoyCodeChallenge`) so PKCE verification fails through the identical
   * code path as a genuinely wrong verifier — the two failures are
   * byte-identical, not merely same-error-code (spec §4.3.4).
   */
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const claimed = await claimAuthorizationCode(this.deps.db, hashAuthorizationCode(authorizationCode));
    if (!claimed || claimed.clientId !== client.client_id) {
      return decoyCodeChallenge();
    }
    return claimed.codeChallenge;
  }

  /**
   * Runs only once PKCE has already passed against a real challenge, so
   * `stored` not existing (or belonging to a different client) here is the
   * narrow remainder of "unknown, expired, or already used" (spec §4.3.4) —
   * an adversarial race against the claim in
   * {@link challengeForAuthorizationCode}, not the ordinary case.
   *
   * Looks the code up via {@link findClaimedAuthorizationCodeByHash}, not a
   * general by-hash lookup (design review of 513ee16, Finding 7): this
   * method's own correctness must not depend on trusting that its caller
   * ran the claim first — an unclaimed (or already-expired) code is
   * unconditionally unknown here, regardless of what any future caller
   * does or skips.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = await findClaimedAuthorizationCodeByHash(this.deps.db, hashAuthorizationCode(authorizationCode));
    if (!stored || stored.clientId !== client.client_id) {
      throw new InvalidGrantError('invalid_grant');
    }
    if (redirectUri !== undefined && redirectUri !== stored.redirectUri) {
      throw new InvalidGrantError('invalid_grant');
    }

    const requestedResource = resource?.href;
    if (requestedResource !== stored.resource || !isCanonicalResource(requestedResource, this.deps.apiBaseUrl)) {
      throw new InvalidTargetError('invalid_target');
    }

    return this.issueTokens(stored.voterId, stored.resource);
  }

  /**
   * Generalizes §4.2's existing rotation to a `resource`-bound token (spec
   * §4.3.1, §4.3.7). The stored family's own `resource` — fixed at
   * issuance, never re-derived — is the sole source of truth for what this
   * refresh token is bound to: the request's `resource` must equal it
   * *exactly*, not merely be canonical on its own. This also closes the
   * mirror-direction laundering Finding 1(b) of the design review of
   * 513ee16 found: a `NULL`-resource (browser) token presented here fails
   * this same comparison against any supplied `resource`, since `NULL`
   * never equals a request value.
   */
  async exchangeRefreshToken(_client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const requestedResource = resource?.href;

    const stored = await findRefreshTokenByHash(this.deps.db, hashRefreshToken(refreshToken));
    const decision = decideRefresh(stored, new Date());
    if (decision.kind === 'invalid') {
      throw new InvalidGrantError('invalid_grant');
    }
    if (decision.kind === 'reuseDetected') {
      // Same reuse-detected family revocation §4.2 already applies to the
      // browser flow -- this is the identical mechanism, not a second one.
      await revokeFamily(this.deps.db, decision.familyId);
      throw new InvalidGrantError('invalid_grant');
    }
    if (decision.token.resource !== requestedResource) {
      throw new InvalidTargetError('invalid_target');
    }

    const newTokenValue = generateRefreshTokenValue();
    const rotated = await rotateRefreshToken(this.deps.db, decision.token, hashRefreshToken(newTokenValue));
    if (rotated.kind === 'lost-race') {
      await revokeFamily(this.deps.db, decision.token.familyId);
      throw new InvalidGrantError('invalid_grant');
    }

    const jwt = await signAccessToken(rotated.token.voterId, this.deps.jwt, requestedResource);
    return { access_token: jwt, token_type: 'Bearer', expires_in: 3600, refresh_token: newTokenValue };
  }

  /**
   * The resource server's own bearer-token check (spec §4.3.6), wired as a
   * Fastify `preHandler` on `/api/v1/mcp` (`src/mcp/route.ts`) — never the
   * REST surface's `authenticatedVoterId`, which refuses any `aud`-bearing
   * token outright (the opposite of what this endpoint needs). Slice 1 only
   * built this far enough to satisfy `OAuthServerProvider`'s interface
   * shape; this completes it with the two checks that make it actually
   * protect a resource: the audience must exactly match this deployment's
   * own MCP resource identifier (an absent `aud` — the browser flow's own
   * token shape — is included in "does not match"), and the voter id rides
   * into `AuthInfo.extra`, the only path a tool handler has to learn whose
   * request it is handling (never a second lookup, per `RequestHandlerExtra`
   * carrying it through as `extra.authInfo.extra.voterId`).
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const payload = await verifyJwt(token, this.deps.jwt);
    if (!isCanonicalResource(payload.aud, this.deps.apiBaseUrl)) {
      throw new InvalidTokenError('access token audience does not match this resource');
    }
    return {
      token,
      clientId: '',
      scopes: [],
      expiresAt: payload.exp,
      resource: new URL(payload.aud),
      extra: { voterId: payload.voterId },
    };
  }

  private async issueTokens(voterId: string, resource: string): Promise<OAuthTokens> {
    const jwt = await signAccessToken(voterId, this.deps.jwt, resource);
    const refreshTokenValue = generateRefreshTokenValue();
    // §4.3.7: bind the new family to `resource` at issuance, once, so it
    // survives every future rotation unchanged.
    await createRefreshTokenFamily(this.deps.db, voterId, hashRefreshToken(refreshTokenValue), resource);
    return { access_token: jwt, token_type: 'Bearer', expires_in: 3600, refresh_token: refreshTokenValue };
  }
}
