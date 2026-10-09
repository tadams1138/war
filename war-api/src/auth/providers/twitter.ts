import * as client from 'openid-client';
import { OpenIdBackedProvider, PROFILE_FETCH_TIMEOUT_MS, stringOrNull, type TokenResponse } from '../openIdBackedProvider.js';
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
    displayName: stringOrNull(me.data.name),
    avatarUrl: stringOrNull(me.data.profile_image_url),
  };
}

/**
 * A `client.ClientAuth` that sends "Basic base64(clientId:clientSecret)" without RFC 6749 Appendix B's
 * form-url-encoding step, unlike oauth4webapi's `ClientSecretBasic`. Twitter/X's token endpoint evidently never
 * URL-decodes the credentials before splitting on ':', so a client secret containing reserved characters fails
 * with `unauthorized_client` / "Missing valid authorization header" when encoded.
 */
export function rawClientSecretBasic(clientId: string, clientSecret: string): client.ClientAuth {
  return (_as, _client, _body, headers) => {
    headers.set('authorization', `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`);
  };
}

export class TwitterProvider extends OpenIdBackedProvider {
  readonly slug = 'twitter';
  // No `openid` scope: Twitter/X's OAuth 2.0 API issues no id_token.
  protected readonly scope = 'tweet.read users.read';
  protected readonly idTokenExpected = false;

  protected buildConfiguration(): Promise<client.Configuration> {
    // Twitter/X publishes no discovery document; these are its documented OAuth 2.0 endpoints.
    const server: client.ServerMetadata = {
      issuer: 'https://api.twitter.com',
      authorization_endpoint: 'https://twitter.com/i/oauth2/authorize',
      token_endpoint: 'https://api.twitter.com/2/oauth2/token',
    };
    // Confidential client: the secret travels via HTTP Basic, using `rawClientSecretBasic` (see its comment).
    return Promise.resolve(
      new client.Configuration(server, this.clientId, this.clientSecret, rawClientSecretBasic(this.clientId, this.clientSecret)),
    );
  }

  protected async mapProfile(tokens: TokenResponse): Promise<OAuthProfile> {
    const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Twitter /2/users/me request failed with status ${response.status}`);
    }
    const me = (await response.json()) as TwitterMeResponse;
    return mapTwitterProfile(me);
  }
}
