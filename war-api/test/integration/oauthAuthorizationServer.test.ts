import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { CimdClientStore } from '../../src/oauth/cimdClientStore.js';
import { FakeClientsStore } from '../setup/fakeClientsStore.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { loginAndCallback, postRefresh } from '../setup/authFlow.js';
import { makeVoter } from '../setup/fixtures.js';

const CLIENT_ID = 'https://client.test/client-metadata.json';
const REDIRECT_URI = 'https://client.test/callback';
const RESOURCE = 'https://api.test/api/v1/mcp';

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function locationParams(response: request.Response): URLSearchParams {
  const location = response.headers.location as string | undefined;
  if (!location) {
    throw new Error(`expected a redirect Location header, got status ${response.status} body ${JSON.stringify(response.body)}`);
  }
  return new URL(location).searchParams;
}

/** Drives the full authorize -> Google round trip -> code redirect, returning the authorization code. */
async function authorizeAndGetCode(
  harness: TestHarness,
  options: { challenge: string; resource?: string; state?: string } = { challenge: pkcePair().challenge },
): Promise<{ code: string; state: string | null; iss: string | null }> {
  const server = harness.app.server;

  const authorizeResponse = await request(server)
    .get('/api/v1/oauth/authorize')
    .query({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: options.challenge,
      code_challenge_method: 'S256',
      resource: options.resource ?? RESOURCE,
      state: options.state ?? 'third-party-state',
    });
  expect(authorizeResponse.status).toBe(302);
  const pendingState = new URL(authorizeResponse.headers.location as string).searchParams.get('state');
  expect(pendingState).toBeTruthy();

  const googleCode = randomUUID();
  harness.google.registerCode(googleCode, { providerUserId: `mcp-user-${googleCode}`, displayName: 'MCP User', avatarUrl: null });

  const callbackResponse = await request(server).get('/api/v1/oauth/google/callback').query({ code: googleCode, state: pendingState! });
  expect(callbackResponse.status).toBe(302);
  const params = locationParams(callbackResponse);

  return { code: params.get('code')!, state: params.get('state'), iss: params.get('iss') };
}

describe('OAuth 2.1 authorization server (spec §4.3)', () => {
  let harness: TestHarness;
  let clientsStore: FakeClientsStore;

  beforeEach(async () => {
    await truncateAll();
    clientsStore = new FakeClientsStore();
    clientsStore.register({ client_id: CLIENT_ID, redirect_uris: [REDIRECT_URI] });
    harness = await buildTestHarness({ oauthClientsStore: clientsStore });
    await harness.app.ready();
  });

  describe('CORS on POST /oauth/token for a browser-based MCP client (design review Finding 8(c))', () => {
    it('the global @fastify/cors policy answers the preflight first and shadows the SDK\'s own permissive cors(), refusing an origin outside uiOrigins -- verified empirically, not reasoned about', async () => {
      // Arrange & Act: `@fastify/cors` is registered globally (app.ts) ahead
      // of the Express bridge, allow-listed to `uiOrigins` only. `Origin`
      // below is deliberately *not* in that list -- an arbitrary
      // browser-based MCP client, exactly the case Finding 8(c) asked
      // whether the SDK's own permissive `cors()` on this route would ever
      // see.
      const response = await request(harness.app.server)
        .options('/api/v1/oauth/token')
        .set('Origin', 'https://mcp-client.test')
        .set('Access-Control-Request-Method', 'POST');

      // Assert: observed, not assumed -- `@fastify/cors` answers the
      // preflight itself (204) but omits `Access-Control-Allow-Origin`
      // entirely for an origin it does not allow-list, which is enough for
      // a real browser to block the actual request. The SDK's own router
      // permissive `cors()` (which would have answered `*`) is never
      // reached: confirmed by the header's absence, not inferred from
      // registration order alone.
      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Rate limiting on the AS\'s own unauthenticated routes (design review Finding 4)', () => {
    it('rate-limits GET /oauth/authorize -- an unauthenticated route the SDK would otherwise leave fully unthrottled', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        resource: RESOURCE,
        state: 'rate-limit-check',
      });

      // Assert: the SDK's own `express-rate-limit` middleware stamps every
      // response with these headers once active -- their presence is what
      // `rateLimit: false` (513ee16) suppressed entirely.
      expect(response.headers['ratelimit-limit']).toBeDefined();
    });

    it('rate-limits POST /oauth/token -- the same unauthenticated-amplifier concern applies to the token endpoint', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code: 'not-a-real-code',
        code_verifier: 'whatever',
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert
      expect(response.headers['ratelimit-limit']).toBeDefined();
    });
  });

  describe('discovery documents (spec §4.3.5)', () => {
    it('GET /.well-known/oauth-authorization-server names the authorization and token endpoints and S256', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/.well-known/oauth-authorization-server');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.authorization_endpoint).toBe('https://api.test/api/v1/oauth/authorize');
      expect(response.body.token_endpoint).toBe('https://api.test/api/v1/oauth/token');
      expect(response.body.code_challenge_methods_supported).toContain('S256');
    });

    it('GET /.well-known/oauth-protected-resource/api/v1/mcp names this resource and its authorization server (RFC 9728 §3.1 path suffix, spec §4.3.5)', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/.well-known/oauth-protected-resource/api/v1/mcp');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.resource).toBe(RESOURCE);
      expect(response.body.authorization_servers).toEqual(['https://api.test']);
    });

    it('GET /.well-known/oauth-protected-resource (the bare, unsuffixed path) 404s -- it is not a fallback location (spec §4.3.5, design review Finding 6)', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/.well-known/oauth-protected-resource');

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe('GET /oauth/authorize', () => {
    it('rejects an unregistered client_id directly, with no redirect (spec §4.3.2)', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: 'https://not-a-registered-client.test/metadata.json',
        redirect_uri: REDIRECT_URI,
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        resource: RESOURCE,
      });

      // Assert
      expect(response.status).toBe(400);
      expect(response.headers.location).toBeUndefined();
    });

    it('rejects a redirect_uri the client did not register directly, with no redirect', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: 'https://attacker.test/callback',
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        resource: RESOURCE,
      });

      // Assert
      expect(response.status).toBe(400);
      expect(response.headers.location).toBeUndefined();
    });

    it('redirects with error=invalid_target when resource is absent (spec §4.3.2)', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
      });

      // Assert
      expect(response.status).toBe(302);
      const params = locationParams(response);
      expect(params.get('error')).toBe('invalid_target');
      expect(params.get('state')).toBe('xyz');
    });

    it('redirects with error=invalid_target when resource is a deployment this server does not serve', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        resource: 'https://someone-elses-api.test/api/v1/mcp',
        state: 'xyz',
      });

      // Assert
      expect(response.status).toBe(302);
      const params = locationParams(response);
      expect(params.get('error')).toBe('invalid_target');
    });

    it('redirects with error=invalid_request when code_challenge_method is not S256', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: 'whatever',
        code_challenge_method: 'plain',
        resource: RESOURCE,
        state: 'xyz',
      });

      // Assert
      expect(response.status).toBe(302);
      const params = locationParams(response);
      expect(params.get('error')).toBe('invalid_request');
    });

    it('completes by redirecting to the client redirect_uri with a code, the original state, and this API\'s issuer', async () => {
      // Arrange & Act
      const { code, state, iss } = await authorizeAndGetCode(harness, { challenge: pkcePair().challenge, state: 'the-clients-state' });

      // Assert
      expect(code).toBeTruthy();
      expect(state).toBe('the-clients-state');
      expect(iss).toBe('https://api.test');
    });

    it('resolves a real Client ID Metadata Document end-to-end through the actual route (spec §4.3.3)', async () => {
      // Arrange: a real CimdClientStore (not the FakeClientsStore this
      // describe block otherwise uses), with only its network edges
      // (DNS + fetch) stubbed -- proves the *route* wires the CIMD resolver
      // in correctly, not just that the resolver works in isolation
      // (already covered by test/unit/cimdClientStore.test.ts).
      const cimdClientId = 'https://cimd-client.test/client-metadata.json';
      const cimdRedirectUri = 'https://cimd-client.test/callback';
      const cimdStore = new CimdClientStore({
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchImpl: (async () =>
          new Response(JSON.stringify({ redirect_uris: [cimdRedirectUri] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })) as unknown as typeof fetch,
      });
      const cimdHarness = await buildTestHarness({ oauthClientsStore: cimdStore });
      await cimdHarness.app.ready();

      // Act
      const response = await request(cimdHarness.app.server).get('/api/v1/oauth/authorize').query({
        response_type: 'code',
        client_id: cimdClientId,
        redirect_uri: cimdRedirectUri,
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        resource: RESOURCE,
        state: 'cimd-state',
      });

      // Assert: proceeds exactly as a registered client would -- redirected
      // onward to Google, not rejected as "no such client".
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('accounts.google.test');
    });

    it('does not affect the existing browser flow (spec §4.1 untouched)', async () => {
      // Arrange
      const loginResponse = await request(harness.app.server).get('/api/v1/auth/google/login');

      // Act & Assert: unchanged shape -- a redirect straight to Google, an
      // oauth_state cookie, nothing routed through the AS's own machinery.
      expect(loginResponse.status).toBe(302);
      expect(loginResponse.get('Set-Cookie')?.some((c: string) => c.startsWith('oauth_state='))).toBe(true);
    });
  });

  describe('POST /oauth/token — authorization_code grant (spec §4.3.4)', () => {
    it('issues a resource-scoped access token for a valid code and matching verifier', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });

      // Act
      const response = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.token_type).toBe('Bearer');
      expect(response.body.access_token).toBeTruthy();
      expect(response.body.refresh_token).toBeTruthy();
      const payload = decodeJwt(response.body.access_token as string);
      expect(payload.aud).toBe(RESOURCE);
    });

    it('rejects a wrong code_verifier — watch it fail for the right reason: PKCE actually verifies', async () => {
      // Arrange
      const { challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const wrongVerifier = randomBytes(32).toString('base64url');

      // Act
      const response = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: wrongVerifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_grant');
    });

    it('produces an identical body for "no such code" and "wrong verifier against a real code" (no error may act as an oracle)', async () => {
      // Arrange
      const { verifier: realVerifier, challenge } = pkcePair();
      const { code: realCode } = await authorizeAndGetCode(harness, { challenge });
      const wrongVerifier = randomBytes(32).toString('base64url');
      const unknownCode = randomBytes(32).toString('base64url');

      // Act
      const wrongVerifierResponse = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code: realCode,
        code_verifier: wrongVerifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      const unknownCodeResponse = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code: unknownCode,
        code_verifier: realVerifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert: both status and body -- an assertion on status alone would
      // not catch a message that leaks which half failed.
      expect(wrongVerifierResponse.status).toBe(unknownCodeResponse.status);
      expect(wrongVerifierResponse.status).toBe(400);
      expect(wrongVerifierResponse.body).toEqual(unknownCodeResponse.body);
    });

    it('refuses to redeem the same code twice (single-use, spec §6) -- explicit replay', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const tokenRequest = () =>
        request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
          resource: RESOURCE,
          client_id: CLIENT_ID,
        });

      // Act
      const first = await tokenRequest();
      const second = await tokenRequest();

      // Assert
      expect(first.status).toBe(200);
      expect(second.status).toBe(400);
      expect(second.body.error).toBe('invalid_grant');
    });

    it('rejects a code redeemed for a resource other than the one it was issued for (audience binding actually binds)', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge, resource: RESOURCE });

      // Act
      const response = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: 'https://someone-elses-api.test/api/v1/mcp',
        client_id: CLIENT_ID,
      });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_target');
    });
  });

  describe('POST /oauth/token — refresh_token grant (spec §4.3.4)', () => {
    it('re-mints an access token scoped to the same canonical resource', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const issued = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Act
      const refreshed = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: issued.body.refresh_token,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert
      expect(refreshed.status).toBe(200);
      const payload = decodeJwt(refreshed.body.access_token as string);
      expect(payload.aud).toBe(RESOURCE);
    });

    it('cannot widen a token\'s audience to an uncanonical resource on refresh (audience binding actually binds)', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const issued = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Act
      const response = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: issued.body.refresh_token,
        resource: 'https://someone-elses-api.test/api/v1/mcp',
        client_id: CLIENT_ID,
      });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_target');
    });

    it('reuse of an AS-issued refresh token is caught by the identical family-revocation mechanism the browser flow uses (shared refresh_tokens table, spec §4.2/§4.3.1) -- not a second mechanism', async () => {
      // Arrange: obtain an OAuth-AS-issued refresh token -- a resource-bound
      // member of the exact same `refresh_tokens` family mechanism spec
      // §4.2 already defines (rotation, single-use, family-wide revocation
      // on reuse). Design review of 513ee16 (Finding 1) found the previous
      // version of this test proved "one shared mechanism" by presenting
      // this very token as a Bearer to the *browser* surface's own
      // DELETE /auth/session and asserting 204 -- which is exactly the
      // cross-audience acceptance §4.3.6's MUST forbids, closed by Finding
      // 1(a) below. This version proves sharing without crossing audiences:
      // reuse detection is driven entirely through the AS's own
      // refresh_token grant, and the assertion is on the shared
      // `refresh_tokens` table's own state, not on a foreign-audience token
      // being accepted anywhere.
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const issued = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      const firstRefreshToken = issued.body.refresh_token as string;

      // Act: rotate once (legitimate use), then replay the now-used token --
      // exactly the reuse scenario §4.2 defines, driven through the AS's
      // own refresh_token grant rather than the browser's /auth/refresh, to
      // prove it is the *same* detection, not a parallel one built for this
      // slice.
      const rotated = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: firstRefreshToken,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      expect(rotated.status).toBe(200);
      const secondRefreshToken = rotated.body.refresh_token as string;

      const replay = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: firstRefreshToken,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert: reuse is refused ...
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe('invalid_grant');

      // ... and the *whole family* is revoked through the one shared
      // `refresh_tokens` mechanism (the same `revoked_at` column and the
      // same `revokeFamily` function spec §4.2 already defines for the
      // browser flow's own reuse detection) -- so even the legitimately
      // rotated successor, never itself reused, is now refused too.
      const afterReuse = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: secondRefreshToken,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      expect(afterReuse.status).toBe(400);
      expect(afterReuse.body.error).toBe('invalid_grant');
    });
  });

  describe('Audience enforcement across the whole REST surface (spec §4.3.6 MUST; design review Finding 1(a))', () => {
    it('refuses an AS-minted access token on an existing browser-flow route (GET /auth/me)', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const issued = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      const accessToken = issued.body.access_token as string;

      // Act: present the AS-minted, resource-bound token to a REST route
      // that is not that resource.
      const response = await request(harness.app.server).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

      // Assert
      expect(response.status).toBe(401);
    });

    it('still accepts an ordinary browser-flow token (no aud claim) on the same route -- behaviour-preserving', async () => {
      // Arrange
      const voter = await makeVoter(harness.db, 'browser-me');
      const jwt = await harness.jwtFor(voter.id);

      // Act
      const response = await request(harness.app.server).get('/api/v1/auth/me').set('Authorization', `Bearer ${jwt}`);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('Audience binding survives refresh (spec §4.3.7; design review Finding 1(b))', () => {
    it('refuses an AS-issued, resource-bound refresh token at the browser flow\'s own POST /auth/refresh, and revokes its family', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const issued = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      const boundRefreshToken = issued.body.refresh_token as string;

      // Act: present the AS's own resource-bound refresh token at the
      // browser flow's plain, unrestricted refresh endpoint -- the exact
      // audience-laundering path Finding 1(b) found live.
      const laundered = await postRefresh(harness, boundRefreshToken);

      // Assert: refused, not laundered into an unrestricted token.
      expect(laundered.status).toBe(401);

      // And treated as severely as reuse -- the whole family is now
      // revoked, so even the AS's own refresh grant refuses it afterwards.
      const afterward = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: boundRefreshToken,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      expect(afterward.status).toBe(400);
      expect(afterward.body.error).toBe('invalid_grant');
    });

    it('refuses a browser-flow (NULL-resource) refresh token at POST /oauth/token\'s refresh grant -- the mirror direction', async () => {
      // Arrange: an ordinary browser login, never touching the AS at all.
      const { refreshTokenValue } = await loginAndCallback(harness, {
        providerUserId: 'mirror-direction@example.com',
        displayName: 'Mirror Direction',
        avatarUrl: null,
      });

      // Act
      const response = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_target');
    });

    it('carries the bound resource forward across a second rotation, not just the first', async () => {
      // Arrange
      const { verifier, challenge } = pkcePair();
      const { code } = await authorizeAndGetCode(harness, { challenge });
      const issued = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Act: rotate twice.
      const firstRotation = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: issued.body.refresh_token,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });
      expect(firstRotation.status).toBe(200);
      const secondRotation = await request(harness.app.server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: firstRotation.body.refresh_token,
        resource: RESOURCE,
        client_id: CLIENT_ID,
      });

      // Assert
      expect(secondRotation.status).toBe(200);
      const payload = decodeJwt(secondRotation.body.access_token as string);
      expect(payload.aud).toBe(RESOURCE);
    });

    it('leaves the browser flow\'s own refresh unaffected by the resource column\'s existence', async () => {
      // Arrange
      const { refreshTokenValue } = await loginAndCallback(harness, {
        providerUserId: 'unaffected-by-resource-column@example.com',
        displayName: 'Unaffected',
        avatarUrl: null,
      });

      // Act
      const response = await postRefresh(harness, refreshTokenValue);

      // Assert
      expect(response.status).toBe(200);
      expect((response.body as { token?: string }).token).toBeTruthy();
    });
  });
});
