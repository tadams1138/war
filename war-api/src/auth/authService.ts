import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { signAccessToken, verifyAccessToken, type JwtOptions } from './jwt.js';
import { decideRefresh, generateRefreshTokenValue, hashRefreshToken, type StoredRefreshToken } from './refreshTokens.js';
import {
  createRefreshTokenFamily,
  findRefreshTokenByHash,
  revokeFamily,
  rotateRefreshToken,
} from './refreshTokensRepository.js';
import { findOrCreateVoter, findVoterById, type Voter } from './votersRepository.js';
import type { CallbackParams, OAuthProfile, OAuthProvider } from './oauthProvider.js';

export interface AuthDependencies {
  db: Kysely<Database>;
  providers: ReadonlyMap<string, OAuthProvider>;
  jwt: JwtOptions;
}

export interface SignedIn {
  kind: 'signedIn';
  voter: Voter;
  created: boolean;
  refreshTokenValue: string;
}

/** A banned Voter cannot sign in at all (§6.7): no refresh token is issued. */
export type CallbackResult = SignedIn | { kind: 'banned' };

export async function beginLogin(
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
 * The one call in the callback flow that reaches the provider over the network. Kept apart from
 * {@link completeCallback} so the route can treat only its failures (network errors, an invalid `iss`, a missing
 * subject claim, any `openid-client` validation error) as the `502` boundary; a failure afterwards (voter upsert,
 * refresh-token issuance) is this API's own fault and stays a `500`.
 */
export async function exchangeAuthorizationCode(
  provider: OAuthProvider,
  params: CallbackParams,
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

  if (voter.banned) {
    return { kind: 'banned' };
  }

  const refreshTokenValue = generateRefreshTokenValue();
  await createRefreshTokenFamily(deps.db, voter.id, hashRefreshToken(refreshTokenValue));

  return { kind: 'signedIn', voter, created, refreshTokenValue };
}

export type RefreshResult =
  | { kind: 'refreshed'; jwt: string; refreshTokenValue: string }
  | { kind: 'reused' }
  | { kind: 'invalid' };

/** Exchanges a presented refresh token for a new JWT, rotating it. */
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

  return rotateForVoter(deps, decision.token);
}

/** Rotates a valid refresh token into a new JWT -- unless its Voter is banned (§6.7: no sign-in at all; their tokens are also revoked at ban time), which counts as invalid. */
async function rotateForVoter(deps: AuthDependencies, token: StoredRefreshToken): Promise<RefreshResult> {
  if ((await findVoterById(deps.db, token.voterId))?.banned) {
    return { kind: 'invalid' };
  }

  const newTokenValue = generateRefreshTokenValue();
  const rotated = await rotateRefreshToken(deps.db, token, hashRefreshToken(newTokenValue));
  if (rotated.kind === 'lostRace') {
    // A concurrent request already rotated this exact token: the same signal as presenting a used one (§5.2).
    await revokeFamily(deps.db, token.familyId);
    return { kind: 'reused' };
  }

  const jwt = await signAccessToken(rotated.token.voterId, deps.jwt);
  return { kind: 'refreshed', jwt, refreshTokenValue: newTokenValue };
}

/** Logs out by revoking the whole refresh-token family, but only when the presented cookie belongs to the authenticated voter; another voter's cookie is silently ignored. */
export async function logout(deps: AuthDependencies, voterId: string, presentedTokenValue: string | undefined): Promise<void> {
  if (!presentedTokenValue) {
    return;
  }
  const stored = await findRefreshTokenByHash(deps.db, hashRefreshToken(presentedTokenValue));
  if (stored && stored.voterId === voterId) {
    await revokeFamily(deps.db, stored.familyId);
  }
}

/** The caller a Bearer JWT names. `voter` is `undefined` only if the token outlived its Voter row. */
export interface AuthenticatedCaller {
  voterId: string;
  voter: Voter | undefined;
}

/** Verifies the Bearer JWT and returns the caller it names, or throws -- including for a banned Voter, whose tokens stop working at once (§6.7). One primary-key lookup per call. */
export async function authenticate(deps: AuthDependencies, authorizationHeader: string | undefined): Promise<AuthenticatedCaller> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('missing bearer token');
  }
  const token = authorizationHeader.slice('Bearer '.length);
  const payload = await verifyAccessToken(token, deps.jwt);
  const voter = await findVoterById(deps.db, payload.voterId);
  if (voter?.banned) {
    throw new Error('voter is banned');
  }
  return { voterId: payload.voterId, voter };
}
