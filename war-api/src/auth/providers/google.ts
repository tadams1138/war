import * as client from 'openid-client';
import { OpenIdBackedProvider, stringOrNull, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

export class GoogleProvider extends OpenIdBackedProvider {
  readonly slug = 'google';
  protected readonly scope = 'openid email profile';

  protected buildConfiguration(): Promise<client.Configuration> {
    return client.discovery(new URL('https://accounts.google.com'), this.clientId, this.clientSecret);
  }

  protected async mapProfile(tokens: TokenResponse, config: client.Configuration): Promise<OAuthProfile> {
    const claims = tokens.claims();
    const subject = claims?.sub;
    if (!subject) {
      throw new Error('Google did not return a subject claim');
    }
    const userinfo = await client.fetchUserInfo(config, tokens.access_token, subject);
    return {
      providerUserId: userinfo.sub,
      displayName: stringOrNull(userinfo.name),
      avatarUrl: stringOrNull(userinfo.picture),
    };
  }
}
