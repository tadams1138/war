import * as client from 'openid-client';
import { OpenIdBackedProvider, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

export class GoogleProvider extends OpenIdBackedProvider {
  readonly slug = 'google';
  protected readonly scope = 'openid email profile';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    super();
  }

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
      displayName: typeof userinfo.name === 'string' ? userinfo.name : null,
      avatarUrl: typeof userinfo.picture === 'string' ? userinfo.picture : null,
    };
  }
}
