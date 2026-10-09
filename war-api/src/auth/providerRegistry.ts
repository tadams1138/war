import type { AppConfig, OAuthClientConfig } from '../config.js';
import type { OAuthProvider } from './oauthProvider.js';
import { GoogleProvider } from './providers/google.js';
import { MicrosoftProvider } from './providers/microsoft.js';
import { FacebookProvider } from './providers/facebook.js';
import { TwitterProvider } from './providers/twitter.js';

type ProviderSlug = keyof AppConfig['oauthProviders'];

/** Keyed by `AppConfig['oauthProviders']`, so a missing or stray provider is a compile error rather than a runtime `undefined`. */
const PROVIDERS: Record<ProviderSlug, new (clientId: string, clientSecret: string) => OAuthProvider> = {
  google: GoogleProvider,
  microsoft: MicrosoftProvider,
  facebook: FacebookProvider,
  twitter: TwitterProvider,
};

function isConfigured(config: OAuthClientConfig): boolean {
  return config.clientId !== '' && config.clientSecret !== '';
}

/**
 * The providers usable in this process: those with both client id and secret set. Tests rely on the registry
 * tolerating a partial config; a real boot never does, since `assertProductionConfig` requires all four (config.ts).
 */
export function buildProviderRegistry(config: AppConfig): ReadonlyMap<string, OAuthProvider> {
  const providers = new Map<string, OAuthProvider>();
  for (const [slug, Provider] of Object.entries(PROVIDERS)) {
    const clientConfig = config.oauthProviders[slug as ProviderSlug];
    if (isConfigured(clientConfig)) {
      providers.set(slug, new Provider(clientConfig.clientId, clientConfig.clientSecret));
    }
  }
  return providers;
}
