import type { AppConfig, OAuthClientConfig } from '../config.js';
import type { OAuthProvider } from './oauthProvider.js';
import { GoogleProvider } from './providers/google.js';
import { MicrosoftProvider } from './providers/microsoft.js';
import { FacebookProvider } from './providers/facebook.js';
import { TwitterProvider } from './providers/twitter.js';

/**
 * Keyed by `AppConfig['oauthProviders']` rather than plain `string`, so a
 * missing or stray key is a compile error here instead of a silent `undefined`
 * at runtime -- which is also what makes the lookup in `buildProviderRegistry`
 * below provably safe rather than merely currently-true.
 */
const FACTORIES: Record<keyof AppConfig['oauthProviders'], (config: OAuthClientConfig) => OAuthProvider> = {
  google: (config) => new GoogleProvider(config.clientId, config.clientSecret),
  microsoft: (config) => new MicrosoftProvider(config.clientId, config.clientSecret),
  facebook: (config) => new FacebookProvider(config.clientId, config.clientSecret),
  twitter: (config) => new TwitterProvider(config.clientId, config.clientSecret),
};

function isConfigured(config: OAuthClientConfig): boolean {
  return config.clientId !== '' && config.clientSecret !== '';
}

/**
 * Builds the set of providers actually usable in this process. A provider
 * appears only when every one of its required config fields is set, so the
 * registry itself tolerates partial configuration -- which is what lets tests
 * construct a config carrying only a subset of providers. No real process
 * boot relies on that tolerance: `server.ts` calls `assertProductionConfig`
 * unconditionally, so every actual boot requires all four providers'
 * credentials (config.ts's PRODUCTION_RULES).
 */
export function buildProviderRegistry(config: AppConfig): ReadonlyMap<string, OAuthProvider> {
  const providers = new Map<string, OAuthProvider>();
  for (const [slug, factory] of Object.entries(FACTORIES)) {
    const clientConfig = config.oauthProviders[slug as keyof AppConfig['oauthProviders']];
    if (isConfigured(clientConfig)) {
      providers.set(slug, factory(clientConfig));
    }
  }
  return providers;
}
