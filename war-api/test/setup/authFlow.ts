import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { OAuthProfile } from '../../src/auth/oauthProvider.js';
import type { FakeOAuthProvider } from './fakeOAuthProvider.js';
import type { TestHarness } from './testApp.js';
import { extractCookieValue } from './httpHelpers.js';

export interface CompletedLogin {
  refreshTokenValue: string;
  callbackResponse: request.Response;
}

export interface BegunLogin {
  agent: ReturnType<typeof request>;
  stateCookie: string;
  pkceCookie: string;
  /** `oauth_state` and `oauth_pkce` together, ready for a single `.set('Cookie', ...)` call. */
  cookieHeader: string;
  /** The `redirect_uri` this login leg actually advertised to the provider (design review finding 7). */
  advertisedRedirectUri: string;
}

/**
 * Drives the login leg only (the spec's step 1) and stops before the
 * callback -- the shared setup every "begin a login, then do something
 * callback-shaped" test needs (design review finding 7: this used to be
 * three near-identical local copies).
 */
export async function beginLogin(harness: TestHarness, provider = 'google'): Promise<BegunLogin> {
  await harness.app.ready();
  const agent = request(harness.app.server);

  const loginResponse = await agent.get(`/api/v1/auth/${provider}/login`);
  const stateCookie = extractCookieValue(loginResponse.get('Set-Cookie'), 'oauth_state');
  const pkceCookie = extractCookieValue(loginResponse.get('Set-Cookie'), 'oauth_pkce');
  if (!stateCookie || !pkceCookie) {
    throw new Error('login did not set both the oauth_state and oauth_pkce cookies');
  }

  const location: string | undefined = loginResponse.headers.location;
  const advertisedRedirectUri = location ? new URL(location).searchParams.get('redirect_uri') : null;
  if (!advertisedRedirectUri) {
    throw new Error('login did not advertise a redirect_uri');
  }

  return {
    agent,
    stateCookie,
    pkceCookie,
    cookieHeader: `oauth_state=${stateCookie}; oauth_pkce=${pkceCookie}`,
    advertisedRedirectUri,
  };
}

/**
 * Drives the real login → callback flow (spec) against the app, with
 * only the provider's network hop stubbed. Registers `profile` against
 * `fake` (the harness's fake for `provider`, defaulting to `harness.google`
 * for the common Google-only case). Returns the refresh-token cookie value
 * the callback set.
 */
export async function loginAndCallback(
  harness: TestHarness,
  profile: OAuthProfile,
  options: { provider?: string; fake?: FakeOAuthProvider } = {},
): Promise<CompletedLogin> {
  const provider = options.provider ?? 'google';
  const fake = options.fake ?? harness.google;
  const { agent, stateCookie, cookieHeader } = await beginLogin(harness, provider);

  const code = randomUUID();
  fake.registerCode(code, profile);

  const callbackResponse = await agent.get(`/api/v1/auth/${provider}/callback`).query({ code, state: stateCookie }).set('Cookie', cookieHeader);

  const refreshTokenValue = extractCookieValue(callbackResponse.get('Set-Cookie'), 'refresh_token');
  if (!refreshTokenValue) {
    throw new Error(`callback did not set a refresh_token cookie (status ${callbackResponse.status})`);
  }

  return { refreshTokenValue, callbackResponse };
}

export async function postRefresh(harness: TestHarness, refreshTokenValue: string, origin = 'https://app.test') {
  await harness.app.ready();
  return request(harness.app.server)
    .post('/api/v1/auth/refresh')
    .set('Cookie', `refresh_token=${refreshTokenValue}`)
    .set('Origin', origin)
    .send();
}
