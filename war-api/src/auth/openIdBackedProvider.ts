import * as client from 'openid-client';
import type { AuthorizationRequest, CallbackParams, OAuthProfile, OAuthProvider } from './oauthProvider.js';

/** The resolved shape `client.authorizationCodeGrant` returns — tokens plus its claims()/expiresIn() helpers. */
export type TokenResponse = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;

/**
 * Every HTTP request a Configuration makes is bounded to this many seconds.
 * openid-client's own documented "30 second default" only applies to a few
 * standalone calls like discovery() -- a Configuration itself starts with
 * `.timeout` unset, and its internal `signal()` helper turns an unset
 * timeout into *no* AbortSignal at all, not a 30-second one. Left unset,
 * the token-exchange request every provider eventually makes can hang
 * forever if that provider is slow or unreachable, surfacing as a raw
 * platform gateway timeout instead of this app's own clean 502 -- exactly
 * what happened when Twitter/X's token endpoint stopped responding.
 */
const REQUEST_TIMEOUT_SECONDS = 10;

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
  /** False for providers with no id_token (Twitter/X, Facebook). Defaults true (every OIDC provider). */
  protected readonly idTokenExpected: boolean = true;

  private configuration: Promise<client.Configuration> | undefined;

  /** Builds (or discovers) this provider's openid-client Configuration. Called once, lazily. */
  protected abstract buildConfiguration(): Promise<client.Configuration>;

  /** Turns a successful token response into this provider's OAuthProfile. */
  protected abstract mapProfile(tokens: TokenResponse, config: client.Configuration): Promise<OAuthProfile>;

  private async config(): Promise<client.Configuration> {
    if (!this.configuration) {
      // A *rejected* promise must not be cached: discovery is a network call,
      // so a transient blip would otherwise be replayed to every subsequent
      // login for this provider until the process restarted. Clearing the
      // field inside the catch lets the next call retry the build.
      this.configuration = this.buildConfiguration()
        .then((configuration) => {
          configuration.timeout = REQUEST_TIMEOUT_SECONDS;
          return configuration;
        })
        .catch((error: unknown) => {
          this.configuration = undefined;
          throw error;
        });
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
