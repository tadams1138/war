import * as client from 'openid-client';
import { describe, expect, it } from 'vitest';
import { OpenIdBackedProvider, type TokenResponse } from '../../../src/auth/openIdBackedProvider.js';
import type { OAuthProfile } from '../../../src/auth/oauthProvider.js';

/**
 * A minimal concrete subclass over a hand-built `client.Configuration` — no
 * discovery, no network. The point is to exercise the *real* S256 derivation
 * in `OpenIdBackedProvider.authorizationUrl`, which the route-level tests
 * cannot reach: there the provider itself is a test double, so its
 * `code_challenge` is whatever the double chooses to echo back.
 */
class StubProvider extends OpenIdBackedProvider {
  readonly slug = 'stub';
  protected readonly scope = 'openid profile';

  constructor(private readonly buildFailures: Error[] = []) {
    super();
  }

  /** How many times `buildConfiguration` has actually been called. */
  buildCount = 0;

  protected buildConfiguration(): Promise<client.Configuration> {
    this.buildCount += 1;
    const failure = this.buildFailures.shift();
    if (failure) {
      return Promise.reject(failure);
    }
    const server: client.ServerMetadata = {
      issuer: 'https://stub.test',
      authorization_endpoint: 'https://stub.test/o/authorize',
      token_endpoint: 'https://stub.test/o/token',
    };
    return Promise.resolve(new client.Configuration(server, 'stub-client-id', 'stub-client-secret'));
  }

  protected mapProfile(_tokens: TokenResponse): Promise<OAuthProfile> {
    return Promise.resolve({ providerUserId: 'stub-user', displayName: null, avatarUrl: null });
  }
}

const CODE_VERIFIER = 'test-code-verifier-0123456789-abcdefghijklmnopqrstuvwxyz';

describe('OpenIdBackedProvider.authorizationUrl PKCE derivation', () => {
  it('sends the real S256 challenge derived from the verifier, never the verifier itself', async () => {
    // Arrange
    const provider = new StubProvider();
    const expectedChallenge = await client.calculatePKCECodeChallenge(CODE_VERIFIER);

    // Act
    const url = new URL(
      await provider.authorizationUrl({
        state: 'a-state-value',
        codeVerifier: CODE_VERIFIER,
        redirectUri: 'https://api.test/api/v1/auth/stub/callback',
      }),
    );

    // Assert
    expect(url.searchParams.get('code_challenge')).toBe(expectedChallenge);
    expect(url.searchParams.get('code_challenge')).not.toBe(CODE_VERIFIER);
  });

  it('advertises S256 as the challenge method', async () => {
    // Arrange
    const provider = new StubProvider();

    // Act
    const url = new URL(
      await provider.authorizationUrl({
        state: 'a-state-value',
        codeVerifier: CODE_VERIFIER,
        redirectUri: 'https://api.test/api/v1/auth/stub/callback',
      }),
    );

    // Assert
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('carries the state and redirect_uri it was handed', async () => {
    // Arrange
    const provider = new StubProvider();

    // Act
    const url = new URL(
      await provider.authorizationUrl({
        state: 'a-state-value',
        codeVerifier: CODE_VERIFIER,
        redirectUri: 'https://api.test/api/v1/auth/stub/callback',
      }),
    );

    // Assert
    expect(url.searchParams.get('state')).toBe('a-state-value');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.test/api/v1/auth/stub/callback');
  });
});

describe('OpenIdBackedProvider configuration caching', () => {
  it('builds the configuration once and reuses it across calls', async () => {
    // Arrange
    const provider = new StubProvider();
    const request = {
      state: 'a-state-value',
      codeVerifier: CODE_VERIFIER,
      redirectUri: 'https://api.test/api/v1/auth/stub/callback',
    };

    // Act
    await provider.authorizationUrl(request);
    await provider.authorizationUrl(request);

    // Assert
    expect(provider.buildCount).toBe(1);
  });

  it('does not cache a rejected configuration — a later attempt retries the build', async () => {
    // Arrange: discovery fails once (a transient network blip), then succeeds.
    const provider = new StubProvider([new Error('getaddrinfo ENOTFOUND stub.test')]);
    const request = {
      state: 'a-state-value',
      codeVerifier: CODE_VERIFIER,
      redirectUri: 'https://api.test/api/v1/auth/stub/callback',
    };

    // Act
    await expect(provider.authorizationUrl(request)).rejects.toThrow('ENOTFOUND');
    const url = new URL(await provider.authorizationUrl(request));

    // Assert
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(provider.buildCount).toBe(2);
  });
});
