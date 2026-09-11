import type { OAuthProfile, OAuthProvider } from '../../src/auth/oauthProvider.js';

/**
 * A test double for the one genuinely external hop in any provider's OAuth
 * flow: the network round-trip to the provider. Everything else (state and
 * PKCE cookie handling, voter upsert, JWT issuance, refresh rotation) runs
 * through the real service code against a real database. Reused across all
 * providers in tests -- it's indifferent to any real provider's quirks.
 */
export class FakeOAuthProvider implements OAuthProvider {
  private readonly profilesByCode = new Map<string, OAuthProfile>();

  /** The `callbackUrl` most recently passed to `exchangeCode`. */
  lastExchangeCallbackUrl: URL | undefined;

  /** The PKCE `codeVerifier` most recently passed to `exchangeCode`. */
  lastCodeVerifier: string | undefined;

  private nextExchangeError: Error | undefined;

  constructor(readonly slug: string) {}

  registerCode(code: string, profile: OAuthProfile): void {
    this.profilesByCode.set(code, profile);
  }

  /** Makes the next `exchangeCode` call throw `error` instead of resolving a profile. */
  failNextExchange(error: Error): void {
    this.nextExchangeError = error;
  }

  async authorizationUrl(params: { state: string; codeVerifier: string; redirectUri: string }): Promise<string> {
    return `https://${this.slug}.test/o/authorize?state=${encodeURIComponent(params.state)}&redirect_uri=${encodeURIComponent(params.redirectUri)}&code_challenge=${encodeURIComponent(params.codeVerifier)}&code_challenge_method=S256`;
  }

  async exchangeCode(params: { callbackUrl: URL; codeVerifier: string; redirectUri: string }): Promise<OAuthProfile> {
    this.lastExchangeCallbackUrl = params.callbackUrl;
    this.lastCodeVerifier = params.codeVerifier;
    if (this.nextExchangeError) {
      const error = this.nextExchangeError;
      this.nextExchangeError = undefined;
      throw error;
    }
    const code = params.callbackUrl.searchParams.get('code');
    const profile = code ? this.profilesByCode.get(code) : undefined;
    if (!profile) {
      throw new Error(`no fake ${this.slug} profile registered for code "${code}"`);
    }
    return profile;
  }
}
