/** Identity fields every provider can supply. A provider that can't fill one leaves it null. */
export interface OAuthProfile {
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthorizationRequest {
  state: string;
  /** PKCE code_verifier; every provider uses PKCE. */
  codeVerifier: string;
  redirectUri: string;
}

export interface CallbackParams {
  callbackUrl: URL;
  codeVerifier: string;
}

/**
 * One OAuth/OIDC identity provider a voter can sign in through: the only external hop in the login flow.
 * State handling, cookies, JWT issuance and the voter upsert live in authService.ts; tests swap this
 * boundary for a double because they cannot drive a real consent screen.
 */
export interface OAuthProvider {
  readonly slug: string;
  authorizationUrl(request: AuthorizationRequest): Promise<string>;
  exchangeCode(params: CallbackParams): Promise<OAuthProfile>;
}
