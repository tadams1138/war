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
    // "consumers" admits personal accounts only. "common" or "organizations" would also work for work and school
    // accounts: openid-client's discovery() recognises login.microsoftonline.com and checks each id_token against its
    // templated `{tenantid}` issuer filled in from the token's tid claim.
    return client.discovery(new URL('https://login.microsoftonline.com/consumers/v2.0'), this.clientId, this.clientSecret);
  }

  protected mapProfile(tokens: TokenResponse): Promise<OAuthProfile> {
    return Promise.resolve(mapMicrosoftProfile(tokens.claims()));
  }
}
