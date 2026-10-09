import * as client from 'openid-client';
import type { AuthorizationRequest, CallbackParams, OAuthProfile, OAuthProvider } from './oauthProvider.js';

/** The resolved shape `client.authorizationCodeGrant` returns — tokens plus its claims()/expiresIn() helpers. */
export type TokenResponse = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;

/**
 * Every HTTP request a Configuration makes is bounded to this many seconds. openid-client's 30-second default
 * covers only standalone calls like discovery(); a Configuration starts with `.timeout` unset, which its
 * `signal()` helper turns into no AbortSignal at all. Left unset, a slow token endpoint (Twitter/X's once stopped
 * responding) hangs the request until the platform's gateway times out, instead of this app's clean 502.
 */
const REQUEST_TIMEOUT_SECONDS = 10;

/** Bound on the profile fetch each provider makes after the token exchange; Node's fetch has no default timeout. */
export const PROFILE_FETCH_TIMEOUT_MS = 5000;

/** A claim or profile field as a string, or null when absent or of another type. */
export function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Shared openid-client plumbing for providers backed by an OAuth 2.0/OIDC authorization server: builds a
 * PKCE-protected authorization URL, runs the authorization_code grant, and hands the tokens to the subclass
 * to turn into an OAuthProfile. Failure handling (the callback's 502 boundary) lives in
 * `authService.exchangeAuthorizationCode`, so no provider repeats it.
 */
export abstract class OpenIdBackedProvider implements OAuthProvider {
  abstract readonly slug: string;
  /** Space-separated OAuth scopes to request, e.g. "openid email profile". */
  protected abstract readonly scope: string;
  /** False for providers with no id_token (Twitter/X, Facebook). Defaults true (every OIDC provider). */
  protected readonly idTokenExpected: boolean = true;

  private configuration: Promise<client.Configuration> | undefined;

  constructor(
    protected readonly clientId: string,
    protected readonly clientSecret: string,
  ) {}

  /** Builds (or discovers) this provider's openid-client Configuration. Called once, lazily. */
  protected abstract buildConfiguration(): Promise<client.Configuration>;

  /** Turns a successful token response into this provider's OAuthProfile. */
  protected abstract mapProfile(tokens: TokenResponse, config: client.Configuration): Promise<OAuthProfile>;

  private async config(): Promise<client.Configuration> {
    if (!this.configuration) {
      // A rejected build is not cached: discovery is a network call, and a transient failure would otherwise
      // be replayed to every login until the process restarts.
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
