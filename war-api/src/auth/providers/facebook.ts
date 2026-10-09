import * as client from 'openid-client';
import { OpenIdBackedProvider, PROFILE_FETCH_TIMEOUT_MS, stringOrNull, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

interface FacebookMeResponse {
  id: string;
  name?: string;
  picture?: { data?: { url?: string } };
}

/** Pure mapping from a Graph API `/me` response to an OAuthProfile. */
export function mapFacebookProfile(me: FacebookMeResponse): OAuthProfile {
  if (!me.id) {
    throw new Error('Facebook did not return an account id');
  }
  return {
    providerUserId: me.id,
    displayName: stringOrNull(me.name),
    avatarUrl: stringOrNull(me.picture?.data?.url),
  };
}

export class FacebookProvider extends OpenIdBackedProvider {
  readonly slug = 'facebook';
  // No `openid` scope: identity comes from the Graph /me call, never from claims. The Configuration below is
  // hand-built (no jwks_uri), so an id_token Facebook chose to return would be validated against metadata never
  // checked against a real response, and a mismatch would 502 every login.
  protected readonly scope = 'public_profile';
  // The classic Graph token endpoint never returns an id_token, and oauth4webapi throws INVALID_RESPONSE when
  // `idTokenExpected` (the base default) is true and none arrives.
  protected readonly idTokenExpected = false;

  // Facebook's OIDC discovery document omits token_endpoint, so client.discovery() would yield a Configuration
  // with nothing to exchange the code against. Built from the documented Graph API endpoints instead.
  protected buildConfiguration(): Promise<client.Configuration> {
    return Promise.resolve(
      new client.Configuration(
        {
          issuer: 'https://www.facebook.com',
          authorization_endpoint: 'https://www.facebook.com/v21.0/dialog/oauth',
          token_endpoint: 'https://graph.facebook.com/v21.0/oauth/access_token',
        },
        this.clientId,
        this.clientSecret,
      ),
    );
  }

  protected async mapProfile(tokens: TokenResponse): Promise<OAuthProfile> {
    // The token travels as a query parameter, Facebook's documented convention for the classic `/me` endpoint,
    // so the URL must never be logged. Graph also accepts `Authorization: Bearer`; moving to it would remove that
    // exposure but needs verifying against a live Facebook app first.
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${encodeURIComponent(tokens.access_token)}`,
      { signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS) },
    );
    if (!response.ok) {
      throw new Error(`Facebook /me request failed with status ${response.status}`);
    }
    const me = (await response.json()) as FacebookMeResponse;
    return mapFacebookProfile(me);
  }
}
