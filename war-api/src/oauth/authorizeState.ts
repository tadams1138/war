import { SignJWT, jwtVerify } from 'jose';
import type { JwtOptions } from '../auth/jwt.js';

const PENDING_AUTHORIZATION_TTL_SECONDS = 10 * 60; // long enough for a human to complete Google's consent screen

/**
 * The third-party OAuth request's own parameters (spec §4.3.2), carried
 * across the existing Google login round trip (§4.1) so the callback that
 * completes it (`src/oauth/callbackRoute.ts`) knows where to mint a code and
 * where to redirect it — without a new server-side "pending request" table,
 * and without touching `oauth_state`/the existing browser callback at all.
 */
export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  /** The third party's own `state`, echoed back unmodified (spec §4.3.2). */
  state?: string;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Signs `pending` as a short-lived, tamper-evident JWT and hands it to
 * Google as this leg's own `state` parameter (spec §4.1's `beginLogin`
 * already threads an opaque `state` through unchanged; this is simply what
 * this AS flow's `state` value *is*). Google returns it verbatim on its
 * callback, and {@link verifyPendingAuthorization} recovers the original
 * request from it — no shared server-side state, so it survives unchanged
 * across multiple API instances.
 */
export async function signPendingAuthorization(pending: PendingAuthorization, jwt: JwtOptions): Promise<string> {
  return new SignJWT({ ...pending })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(jwt.issuer)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PENDING_AUTHORIZATION_TTL_SECONDS)
    .sign(key(jwt.secret));
}

/** Verifies and decodes a pending-authorization token, or throws if it is missing, expired, or tampered with. */
export async function verifyPendingAuthorization(token: string, jwt: JwtOptions): Promise<PendingAuthorization> {
  const { payload } = await jwtVerify(token, key(jwt.secret), { issuer: jwt.issuer });
  const { clientId, redirectUri, codeChallenge, resource, state } = payload;
  if (typeof clientId !== 'string' || typeof redirectUri !== 'string' || typeof codeChallenge !== 'string' || typeof resource !== 'string') {
    throw new Error('pending authorization token missing required fields');
  }
  return { clientId, redirectUri, codeChallenge, resource, state: typeof state === 'string' ? state : undefined };
}
