import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { CimdClientStore } from '../../src/oauth/cimdClientStore.js';
import { FakeClientsStore } from '../setup/fakeClientsStore.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

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

    it('GET /.well-known/oauth-protected-resource names this resource and its authorization server', async () => {
      // Arrange & Act
      const response = await request(harness.app.server).get('/.well-known/oauth-protected-resource');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.resource).toBe(RESOURCE);
      expect(response.body.authorization_servers).toEqual(['https://api.test']);
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

    it('a token issued by this server is revocable exactly like a browser session\'s (shared refresh_tokens mechanism, spec §4.2/§4.3.1)', async () => {
      // Arrange: obtain an OAuth-AS-issued JWT + refresh token.
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
      const refreshTokenValue = issued.body.refresh_token as string;

      // Act: revoke via the *browser* surface's own logout, reusing the
      // identical JWT and refresh-token-family machinery (§4.2) --
      // proving the two surfaces really do share one mechanism, not two.
      const logoutResponse = await request(harness.app.server)
        .delete('/api/v1/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refresh_token=${refreshTokenValue}`)
        .send();
      expect(logoutResponse.status).toBe(204);

      const subsequentRefresh = await request(harness.app.server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${refreshTokenValue}`)
        .set('Origin', 'https://app.test')
        .send();

      // Assert
      expect(subsequentRefresh.status).toBe(401);
    });
  });
});
