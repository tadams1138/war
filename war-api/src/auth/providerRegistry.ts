import type { AppConfig, OAuthClientConfig } from '../config.js';
import type { OAuthProvider } from './oauthProvider.js';
import { GoogleProvider } from './providers/google.js';
import { MicrosoftProvider } from './providers/microsoft.js';
import { FacebookProvider } from './providers/facebook.js';
import { TwitterProvider } from './providers/twitter.js';

const FACTORIES: Record<string, (config: OAuthClientConfig) => OAuthProvider> = {
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
 * appears only when every one of its required config fields is set, so
 * local dev and CI can run with only Google configured while production
 * requires all of them (config.ts's PRODUCTION_RULES enforces that).
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
