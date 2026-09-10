import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { signAccessToken, verifyAccessToken, type JwtOptions } from './jwt.js';
import { decideRefresh, generateRefreshTokenValue, hashRefreshToken } from './refreshTokens.js';
import {
  createRefreshTokenFamily,
  findRefreshTokenByHash,
  revokeFamily,
  rotateRefreshToken,
} from './refreshTokensRepository.js';
import { findOrCreateVoter, findVoterById, type Voter } from './votersRepository.js';
import type { GoogleAuthProvider, OAuthProfile } from './googleProvider.js';

export interface AuthDependencies {
  db: Kysely<Database>;
  google: GoogleAuthProvider;
  jwt: JwtOptions;
}

export interface CallbackResult {
  voter: Voter;
  created: boolean;
  refreshTokenValue: string;
}

export async function beginLogin(
  deps: AuthDependencies,
  redirectUri: string,
): Promise<{ state: string; authorizationUrl: string }> {
  const state = generateRefreshTokenValue();
  const authorizationUrl = await deps.google.authorizationUrl({ state, redirectUri });
  return { state, authorizationUrl };
}

export type ExchangeResult =
  | { kind: 'exchanged'; profile: OAuthProfile }
  | { kind: 'exchangeFailed'; cause: unknown };

/**
 * The one call in the callback flow that is a genuine external dependency
 * (spec §4.1 #4: "a network round-trip to Google"). Split out from
 * {@link completeCallback} so the route can act on *only* this call's
 * failures as the `502` boundary — a failure here (network failure, an
 * invalid/missing `iss`, a missing subject claim, any
 * `openid-client`/`oauth4webapi` validation error) maps to `502`, while a
 * failure in what comes after (voter upsert, refresh-token issuance) is
 * this API's own fault and must keep surfacing as an unmapped `500`.
 *
 * Owns its own try/catch and returns a discriminated union rather than
 * throwing, so the boundary is enforced by the type checker at the call
 * site (an exhaustive `kind` check) instead of by brace placement around a
 * bare `try` that a later edit could silently widen.
 */
export async function exchangeGoogleCode(deps: AuthDependencies, params: { callbackUrl: URL }): Promise<ExchangeResult> {
  try {
    const profile = await deps.google.exchangeCode(params);
    return { kind: 'exchanged', profile };
  } catch (cause) {
    return { kind: 'exchangeFailed', cause };
  }
}

/** Upserts the Voter and issues a refresh-token family for an already-exchanged OAuth profile. */
export async function completeCallback(deps: AuthDependencies, profile: OAuthProfile): Promise<CallbackResult> {
  const { voter, created } = await findOrCreateVoter(deps.db, 'google', profile);

  const refreshTokenValue = generateRefreshTokenValue();
  await createRefreshTokenFamily(deps.db, voter.id, hashRefreshToken(refreshTokenValue));

  return { voter, created, refreshTokenValue };
}

export type RefreshResult =
  | { kind: 'refreshed'; jwt: string; refreshTokenValue: string }
  | { kind: 'reused' }
  | { kind: 'resourceBound' }
  | { kind: 'invalid' };

/** Exchanges a presented refresh token for a new JWT, rotating it (spec §5.2). */
export async function refresh(deps: AuthDependencies, presentedTokenValue: string): Promise<RefreshResult> {
  const stored = await findRefreshTokenByHash(deps.db, hashRefreshToken(presentedTokenValue));
  const decision = decideRefresh(stored, new Date());

  if (decision.kind === 'invalid') {
    return { kind: 'invalid' };
  }
  if (decision.kind === 'reuseDetected') {
    await revokeFamily(deps.db, decision.familyId);
    return { kind: 'reused' };
  }
  if (decision.token.resource !== null) {
    // §4.3.7: this endpoint mints a plain, unrestricted access token -- it
    // has no `resource` parameter and no way to honor a binding even if it
    // wanted to, so a token that already carries one (minted by the AS,
    // §4.3) does not belong here at all. Treated as severely as reuse
    // (family revoked), not a plain refusal: nothing about the ordinary
    // browser flow ever produces a bound token, so presenting one here is
    // the audience-laundering attempt §4.3.6 exists to prevent.
    await revokeFamily(deps.db, decision.token.familyId);
    return { kind: 'resourceBound' };
  }

  const newTokenValue = generateRefreshTokenValue();
  const rotated = await rotateRefreshToken(deps.db, decision.token, hashRefreshToken(newTokenValue));
  if (rotated.kind === 'lost-race') {
    // Another request already rotated this exact token concurrently — the
    // same signal as presenting an already-used token (spec §5.2).
    await revokeFamily(deps.db, decision.token.familyId);
    return { kind: 'reused' };
  }

  const jwt = await signAccessToken(rotated.token.voterId, deps.jwt);
  return { kind: 'refreshed', jwt, refreshTokenValue: newTokenValue };
}

/**
 * Logs out by revoking the whole refresh-token family (spec §5.2) — but only
 * when the presented refresh-token cookie actually belongs to the
 * authenticated voter making the request. A cookie naming a different
 * voter's family is silently ignored rather than acted on.
 */
export async function logout(deps: AuthDependencies, voterId: string, presentedTokenValue: string | undefined): Promise<void> {
  if (!presentedTokenValue) {
    return;
  }
  const stored = await findRefreshTokenByHash(deps.db, hashRefreshToken(presentedTokenValue));
  if (stored && stored.voterId === voterId) {
    await revokeFamily(deps.db, stored.familyId);
  }
}

export async function currentVoter(deps: AuthDependencies, authorizationHeader: string | undefined): Promise<Voter> {
  const voterId = await authenticatedVoterId(deps, authorizationHeader);
  const voter = await findVoterById(deps.db, voterId);
  if (!voter) {
    throw new Error('authenticated voter no longer exists');
  }
  return voter;
}

/** Verifies the Bearer JWT and returns the voter id it carries, or throws. */
export async function authenticatedVoterId(
  deps: AuthDependencies,
  authorizationHeader: string | undefined,
): Promise<string> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('missing bearer token');
  }
  const token = authorizationHeader.slice('Bearer '.length);
  const payload = await verifyAccessToken(token, deps.jwt);
  if (payload.aud !== undefined) {
    // An audience-bound token was minted by the OAuth 2.1 authorization
    // server (§4.3) for exactly one resource (its MCP endpoint, §4.3.6) --
    // "this API never accepts a token whose aud is not its own resource
    // identifier" is a MUST that section already states, unimplemented
    // until now (design review of 513ee16, Finding 1(a)). No REST route
    // reached through this function is that resource, so any `aud`-bearing
    // token is refused here, unconditionally. A browser-flow token never
    // carries `aud` at all (jwt.ts), so this is behaviour-preserving for it.
    throw new Error('audience-bound token is not valid for this route');
  }
  return payload.voterId;
}
