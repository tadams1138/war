import * as client from 'openid-client';
import type { AuthorizationRequest, CallbackParams, OAuthProfile, OAuthProvider } from './oauthProvider.js';

/** The resolved shape `client.authorizationCodeGrant` returns — tokens plus its claims()/expiresIn() helpers. */
export type TokenResponse = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;

/**
 * Shared openid-client plumbing for every provider backed by an OAuth
 * 2.0/OIDC authorization server: builds a PKCE-protected authorization URL,
 * runs the authorization_code grant, and hands the resulting tokens to the
 * subclass to turn into an OAuthProfile. Does only the happy path -- the
 * try/catch that turns a failure here into the callback's 502 boundary
 * lives in authService.exchangeAuthorizationCode, not here, so every
 * provider gets that boundary for free without repeating it.
 */
export abstract class OpenIdBackedProvider implements OAuthProvider {
  abstract readonly slug: string;
  /** Space-separated OAuth scopes to request, e.g. "openid email profile". */
  protected abstract readonly scope: string;
  /** False for providers with no id_token (Twitter/X). Defaults true (every OIDC provider). */
  protected readonly idTokenExpected: boolean = true;

  private configuration: Promise<client.Configuration> | undefined;

  /** Builds (or discovers) this provider's openid-client Configuration. Called once, lazily. */
  protected abstract buildConfiguration(): Promise<client.Configuration>;

  /** Turns a successful token response into this provider's OAuthProfile. */
  protected abstract mapProfile(tokens: TokenResponse, config: client.Configuration): Promise<OAuthProfile>;

  private async config(): Promise<client.Configuration> {
    if (!this.configuration) {
      this.configuration = this.buildConfiguration();
    }
    return this.configuration;
  }

  async authorizationUrl(request: AuthorizationRequest): Promise<string> {
    const config = await this.config();
    const codeChallenge = await client.calculatePKCECodeChallenge(request.codeVerifier);
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: request.redirectUri,
      scope: this.scope,
      state: request.state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return url.href;
  }

  async exchangeCode(params: CallbackParams): Promise<OAuthProfile> {
    const config = await this.config();
    const tokens = await client.authorizationCodeGrant(config, params.callbackUrl, {
      expectedState: client.skipStateCheck,
      pkceCodeVerifier: params.codeVerifier,
      idTokenExpected: this.idTokenExpected,
    });
    return this.mapProfile(tokens, config);
  }
}
