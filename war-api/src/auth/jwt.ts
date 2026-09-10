import { SignJWT, jwtVerify } from 'jose';

export interface JwtOptions {
  secret: string;
  issuer: string;
}

export interface AccessTokenPayload {
  voterId: string;
  exp?: number;
  /**
   * RFC 8707 resource audience (spec §4.3.4) — set only for a token minted
   * by the OAuth 2.1 authorization server (§4.3). The browser flow (§4.1,
   * §4.2) never requests one, so its tokens carry no `aud` claim at all,
   * unchanged from before this field existed.
   */
  aud?: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h, spec §5

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Issues a signed JWT (1h expiry) carrying the voter's id (spec §5).
 * `audience`, when supplied, is stamped as the JWT's `aud` claim — the OAuth
 * 2.1 authorization server (§4.3.4) is the only caller that ever passes one,
 * binding the token to the `resource` it was requested for.
 */
export async function signAccessToken(voterId: string, options: JwtOptions, audience?: string): Promise<string> {
  const builder = new SignJWT({ voterId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(options.issuer)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS);
  if (audience) {
    builder.setAudience(audience);
  }
  return builder.sign(key(options.secret));
}

/** Verifies a JWT's signature, issuer, and expiry, returning its payload. */
export async function verifyAccessToken(token: string, options: JwtOptions): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, key(options.secret), { issuer: options.issuer });
  if (typeof payload.voterId !== 'string') {
    throw new Error('JWT payload missing voterId');
  }
  return { voterId: payload.voterId, exp: payload.exp, aud: typeof payload.aud === 'string' ? payload.aud : undefined };
}
