/** Identity fields every provider can supply. A provider that can't fill one leaves it null. */
export interface OAuthProfile {
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthorizationRequest {
  state: string;
  /** PKCE code_verifier — every provider gets one now, not just the ones that require it. */
  codeVerifier: string;
  redirectUri: string;
}

export interface CallbackParams {
  callbackUrl: URL;
  codeVerifier: string;
  /**
   * Currently unread by every provider: `openid-client`'s
   * `authorizationCodeGrant` derives the `redirect_uri` it sends from the
   * callback URL itself, so nothing has to be told it separately. Kept
   * deliberately -- for symmetry with `AuthorizationRequest` above, and
   * reserved for a future provider whose token exchange demands an explicit
   * `redirect_uri` parameter.
   */
  redirectUri: string;
}

/**
 * One OAuth/OIDC identity provider a voter can sign in through. The one
 * genuinely external hop in the login flow -- state handling, cookie
 * delivery, JWT issuance, voter upsert all live in authService.ts and are
 * exercised directly in tests. Only this boundary is swapped for a test
 * double (FakeOAuthProvider), because a test cannot honestly drive a real
 * provider's consent screen.
 */
export interface OAuthProvider {
  readonly slug: string;
  authorizationUrl(request: AuthorizationRequest): Promise<string>;
  exchangeCode(params: CallbackParams): Promise<OAuthProfile>;
}
