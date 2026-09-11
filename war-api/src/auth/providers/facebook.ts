import * as client from 'openid-client';
import { OpenIdBackedProvider, type TokenResponse } from '../openIdBackedProvider.js';
import type { OAuthProfile } from '../oauthProvider.js';

interface FacebookMeResponse {
  id: string;
  name?: string;
  picture?: { data?: { url?: string } };
}

/** Pure mapping from a Graph API `/me` response to an OAuthProfile. */
export function mapFacebookProfile(me: FacebookMeResponse): OAuthProfile {
  return {
    providerUserId: me.id,
    displayName: typeof me.name === 'string' ? me.name : null,
    avatarUrl: typeof me.picture?.data?.url === 'string' ? me.picture.data.url : null,
  };
}

export class FacebookProvider extends OpenIdBackedProvider {
  readonly slug = 'facebook';
  protected readonly scope = 'openid public_profile';
  // Identity always comes from the Graph /me call below, never from claims
  // -- see this task's design note on why discovery is used only for
  // endpoints, not identity.
  //
  // Kept explicit (not dropped) even though buildConfiguration() below is a
  // manually-constructed Configuration, not discovery: verified against
  // oauth4webapi's shipped source (processAuthorizationCodeResponse /
  // processAuthorizationCodeOpenIDResponse in
  // node_modules/oauth4webapi/build/index.js) that idTokenExpected=true
  // unconditionally asserts an id_token is present in the token response
  // and throws INVALID_RESPONSE when it is not -- and Facebook's classic
  // graph.facebook.com token endpoint used below never returns one. Leaving
  // this at the base class's true default would make every real callback
  // fail.
  protected readonly idTokenExpected = false;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    super();
  }

  // Facebook's OIDC discovery document (verified live at
  // https://www.facebook.com/.well-known/openid-configuration/) publishes an
  // issuer and authorization_endpoint but omits token_endpoint entirely, so
  // client.discovery() can't be used here -- a Configuration built from it
  // would have no token endpoint to call. Built manually instead from
  // Facebook's documented, stable Graph API endpoints.
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
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${encodeURIComponent(tokens.access_token)}`,
    );
    if (!response.ok) {
      throw new Error(`Facebook /me request failed with status ${response.status}`);
    }
    const me = (await response.json()) as FacebookMeResponse;
    return mapFacebookProfile(me);
  }
}
