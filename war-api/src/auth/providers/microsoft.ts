import * as client from 'openid-client';
import { OpenIdBackedProvider, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

/**
 * Pure mapping from an id_token's claims to an OAuthProfile, split out from
 * the class so it's directly unit-testable without a real (or mocked)
 * network round-trip -- the same boundary Google's provider draws around
 * its `fetchUserInfo` call, just without any network hop of its own since
 * Microsoft puts everything needed in the id_token.
 */
export function mapMicrosoftProfile(claims: { sub?: string; name?: unknown } | undefined): OAuthProfile {
  const subject = claims?.sub;
  if (!subject) {
    throw new Error('Microsoft did not return a subject claim');
  }
  return {
    providerUserId: subject,
    displayName: typeof claims?.name === 'string' ? claims.name : null,
    // Microsoft Graph's profile photo needs a separate authenticated,
    // binary-response call (`/me/photo/$value`) -- not worth the extra
    // round-trip and scope for a field the platform treats as best-effort.
    avatarUrl: null,
  };
}

export class MicrosoftProvider extends OpenIdBackedProvider {
  readonly slug = 'microsoft';
  protected readonly scope = 'openid profile';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    super();
  }

  protected buildConfiguration(): Promise<client.Configuration> {
    // "consumers" (personal Microsoft accounts only), not "common" (which
    // also covers work/school accounts): "common"'s discovery document
    // advertises a templated issuer (`.../{tenantid}/v2.0`) that
    // openid-client's strict issuer validation does not accept out of the
    // box. "consumers" has one fixed, real issuer.
    return client.discovery(new URL('https://login.microsoftonline.com/consumers/v2.0'), this.clientId, this.clientSecret);
  }

  protected mapProfile(tokens: TokenResponse): Promise<OAuthProfile> {
    return Promise.resolve(mapMicrosoftProfile(tokens.claims()));
  }
}
