import * as client from 'openid-client';
import { OpenIdBackedProvider, stringOrNull, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

/** Pure mapping from an id_token's claims to an OAuthProfile; Microsoft puts everything needed in the id_token, so no network hop. */
export function mapMicrosoftProfile(claims: { sub?: string; name?: unknown } | undefined): OAuthProfile {
  const subject = claims?.sub;
  if (!subject) {
    throw new Error('Microsoft did not return a subject claim');
  }
  return {
    providerUserId: subject,
    displayName: stringOrNull(claims?.name),
    // Graph's profile photo needs a separate authenticated binary call (`/me/photo/$value`); not worth it for a best-effort field.
    avatarUrl: null,
  };
}

export class MicrosoftProvider extends OpenIdBackedProvider {
  readonly slug = 'microsoft';
  protected readonly scope = 'openid profile';

  protected buildConfiguration(): Promise<client.Configuration> {
    // "consumers" (personal accounts only), not "common": the latter's discovery document advertises a templated
    // issuer (`.../{tenantid}/v2.0`) that openid-client's strict issuer validation rejects.
    return client.discovery(new URL('https://login.microsoftonline.com/consumers/v2.0'), this.clientId, this.clientSecret);
  }

  protected mapProfile(tokens: TokenResponse): Promise<OAuthProfile> {
    return Promise.resolve(mapMicrosoftProfile(tokens.claims()));
  }
}
