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
import type { OAuthProfile, OAuthProvider } from './oauthProvider.js';

export interface AuthDependencies {
  db: Kysely<Database>;
  providers: ReadonlyMap<string, OAuthProvider>;
  jwt: JwtOptions;
}

export interface CallbackResult {
  voter: Voter;
  created: boolean;
  refreshTokenValue: string;
}

export async function beginLogin(
  deps: AuthDependencies,
  provider: OAuthProvider,
  redirectUri: string,
): Promise<{ state: string; codeVerifier: string; authorizationUrl: string }> {
  const state = generateRefreshTokenValue();
  const codeVerifier = generateRefreshTokenValue();
  const authorizationUrl = await provider.authorizationUrl({ state, codeVerifier, redirectUri });
  return { state, codeVerifier, authorizationUrl };
}

export type ExchangeResult = { kind: 'exchanged'; profile: OAuthProfile } | { kind: 'exchangeFailed'; cause: unknown };

/**
 * The one call in the callback flow that is a genuine external dependency
 * (a network round-trip to the provider). Split out from
 * {@link completeCallback} so the route can act on *only* this call's
 * failures as the `502` boundary -- a failure here (network failure, an
 * invalid/missing `iss`, a missing subject claim, any
 * `openid-client`/`oauth4webapi` validation error) maps to `502`, while a
 * failure in what comes after (voter upsert, refresh-token issuance) is
 * this API's own fault and must keep surfacing as an unmapped `500`.
 */
export async function exchangeAuthorizationCode(
  deps: AuthDependencies,
  provider: OAuthProvider,
  params: { callbackUrl: URL; codeVerifier: string; redirectUri: string },
): Promise<ExchangeResult> {
  try {
    const profile = await provider.exchangeCode(params);
    return { kind: 'exchanged', profile };
  } catch (cause) {
    return { kind: 'exchangeFailed', cause };
  }
}

/** Upserts the Voter and issues a refresh-token family for an already-exchanged OAuth profile. */
export async function completeCallback(deps: AuthDependencies, providerSlug: string, profile: OAuthProfile): Promise<CallbackResult> {
  const { voter, created } = await findOrCreateVoter(deps.db, providerSlug, profile);

  const refreshTokenValue = generateRefreshTokenValue();
  await createRefreshTokenFamily(deps.db, voter.id, hashRefreshToken(refreshTokenValue));

  return { voter, created, refreshTokenValue };
}

export type RefreshResult =
  | { kind: 'refreshed'; jwt: string; refreshTokenValue: string }
  | { kind: 'reused' }
  | { kind: 'invalid' };

/** Exchanges a presented refresh token for a new JWT, rotating it (spec). */
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

  const newTokenValue = generateRefreshTokenValue();
  const rotated = await rotateRefreshToken(deps.db, decision.token, hashRefreshToken(newTokenValue));
  if (rotated.kind === 'lost-race') {
    // Another request already rotated this exact token concurrently — the
    // same signal as presenting an already-used token (spec).
    await revokeFamily(deps.db, decision.token.familyId);
    return { kind: 'reused' };
  }

  const jwt = await signAccessToken(rotated.token.voterId, deps.jwt);
  return { kind: 'refreshed', jwt, refreshTokenValue: newTokenValue };
}

/**
 * Logs out by revoking the whole refresh-token family (spec) — but only
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
  return payload.voterId;
}
