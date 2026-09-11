import { describe, expect, it } from 'vitest';
import { buildProviderRegistry } from '../../../src/auth/providerRegistry.js';
import { loadConfig, type AppConfig } from '../../../src/config.js';

/** Every provider configured, via the real `loadConfig` — no hand-built AppConfig literal. */
function allProvidersConfigured(): AppConfig {
  return loadConfig({
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    MICROSOFT_CLIENT_ID: 'microsoft-client-id',
    MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
    FACEBOOK_CLIENT_ID: 'facebook-client-id',
    FACEBOOK_CLIENT_SECRET: 'facebook-client-secret',
    TWITTER_CLIENT_ID: 'twitter-client-id',
    TWITTER_CLIENT_SECRET: 'twitter-client-secret',
  } as NodeJS.ProcessEnv);
}

describe('buildProviderRegistry', () => {
  it('keys every provider by its own slug, so a route lookup can never reach the wrong provider', () => {
    // Arrange
    const config = allProvidersConfigured();

    // Act
    const registry = buildProviderRegistry(config);

    // Assert
    expect([...registry.keys()].sort()).toEqual(['facebook', 'google', 'microsoft', 'twitter']);
    for (const [key, provider] of registry) {
      expect(provider.slug).toBe(key);
    }
  });

  it('omits a provider whose client credentials are empty', () => {
    // Arrange: only Google carries credentials.
    const config = loadConfig({
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
    } as NodeJS.ProcessEnv);

    // Act
    const registry = buildProviderRegistry(config);

    // Assert
    expect([...registry.keys()]).toEqual(['google']);
  });

  it('omits a provider carrying an id but no secret', () => {
    // Arrange
    const config = allProvidersConfigured();
    config.oauthProviders.twitter = { clientId: 'twitter-client-id', clientSecret: '' };

    // Act
    const registry = buildProviderRegistry(config);

    // Assert
    expect(registry.has('twitter')).toBe(false);
    expect([...registry.keys()].sort()).toEqual(['facebook', 'google', 'microsoft']);
  });
});
