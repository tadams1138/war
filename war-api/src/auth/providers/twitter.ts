import * as client from 'openid-client';
import { OpenIdBackedProvider, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

interface TwitterMeResponse {
  data: { id: string; name?: string; profile_image_url?: string };
}

/** Pure mapping from a `GET /2/users/me` response to an OAuthProfile. */
export function mapTwitterProfile(me: TwitterMeResponse): OAuthProfile {
  if (!me.data.id) {
    throw new Error('Twitter/X did not return an account id');
  }
  return {
    providerUserId: me.data.id,
    displayName: typeof me.data.name === 'string' ? me.data.name : null,
    avatarUrl: typeof me.data.profile_image_url === 'string' ? me.data.profile_image_url : null,
  };
}

export class TwitterProvider extends OpenIdBackedProvider {
  readonly slug = 'twitter';
  // No openid scope -- Twitter/X's OAuth 2.0 API issues no id_token at all.
  protected readonly scope = 'tweet.read users.read';
  protected readonly idTokenExpected = false;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    super();
  }

  protected buildConfiguration(): Promise<client.Configuration> {
    // No discovery document exists for Twitter/X -- these three endpoints
    // are its documented, stable OAuth 2.0 surface, hand-supplied instead.
    const server: client.ServerMetadata = {
      issuer: 'https://api.twitter.com',
      authorization_endpoint: 'https://twitter.com/i/oauth2/authorize',
      token_endpoint: 'https://api.twitter.com/2/oauth2/token',
    };
    // Confidential client: the secret travels via HTTP Basic on the token
    // request, which is what Twitter/X's OAuth 2.0 implementation expects
    // from a server-side (non-public) client.
    return Promise.resolve(new client.Configuration(server, this.clientId, this.clientSecret, client.ClientSecretBasic(this.clientSecret)));
  }

  protected async mapProfile(tokens: TokenResponse): Promise<OAuthProfile> {
    // `AbortSignal.timeout` because Node's fetch has no default timeout: a
    // hung provider would otherwise hold the callback request open
    // indefinitely. The abort throws, which the callback's existing 502
    // boundary already covers.
    const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Twitter /2/users/me request failed with status ${response.status}`);
    }
    const me = (await response.json()) as TwitterMeResponse;
    return mapTwitterProfile(me);
  }
}
