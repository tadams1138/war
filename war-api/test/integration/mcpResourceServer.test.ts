import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { signAccessToken } from '../../src/auth/jwt.js';
import { mcpResourceIdentifier, protectedResourceMetadataUrl } from '../../src/oauth/resource.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { makeVoter } from '../setup/fixtures.js';
import { truncateAll } from '../setup/testDb.js';

/**
 * Spec §4.3.6/§7.9's "MCP Resource Server" Gherkin (§14): the bearer check
 * protecting `/api/v1/mcp`, exercised over a real listening HTTP server
 * (not `supertest` against an unlistened handler) because the successful
 * path's response is a Streamable HTTP stream this test deliberately does
 * not wait to finish -- only that the resource server let the request past
 * its own auth check and started answering.
 */
describe('MCP Resource Server (spec §4.3.6, §7.9)', () => {
  let harness: TestHarness;
  let baseUrl: string;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
    await harness.app.listen({ port: 0, host: '127.0.0.1' });
    const address = harness.app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await harness.app.close();
  });

  /** A raw Node `http` request to the real listening server -- deliberately not `undici`/`fetch`, which the "no forwarding" test below intercepts globally. */
  function postMcp(headers: Record<string, string>, body: string): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        `${baseUrl}/api/v1/mcp`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers } },
        (res) => {
          resolve({ status: res.statusCode!, headers: res.headers });
          res.destroy();
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }

  const initializeBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'resource-server-test', version: '0.0.0' } },
  });

  it('a request with no bearer token is challenged with the exact protected-resource metadata URL', async () => {
    // Arrange & Act
    const response = await postMcp({}, initializeBody);

    // Assert
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="${protectedResourceMetadataUrl(harness.config.apiBaseUrl)}"`,
    );
    expect(protectedResourceMetadataUrl(harness.config.apiBaseUrl)).toBe(
      `${harness.config.apiBaseUrl}/.well-known/oauth-protected-resource/api/v1/mcp`,
    );
  });

  it('a token with no audience at all is rejected -- the browser flow\'s own token shape', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'creator');
    const token = await harness.jwtFor(voter.id);

    // Act
    const response = await postMcp({ Authorization: `Bearer ${token}` }, initializeBody);

    // Assert
    expect(response.status).toBe(401);
  });

  it('a token audience-bound to a different resource is rejected', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'creator');
    const token = await signAccessToken(
      voter.id,
      { secret: harness.config.jwtSecret, issuer: harness.config.jwtIssuer },
      'https://someone-elses-api.test/api/v1/mcp',
    );

    // Act
    const response = await postMcp({ Authorization: `Bearer ${token}` }, initializeBody);

    // Assert
    expect(response.status).toBe(401);
  });

  it('a token correctly audienced for this resource is let past the bearer check', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'creator');
    const token = await signAccessToken(
      voter.id,
      { secret: harness.config.jwtSecret, issuer: harness.config.jwtIssuer },
      mcpResourceIdentifier(harness.config.apiBaseUrl),
    );

    // Act
    const response = await postMcp({ Authorization: `Bearer ${token}` }, initializeBody);

    // Assert: never 401 -- the request reached the MCP transport itself.
    expect(response.status).not.toBe(401);
    expect(response.status).toBe(200);
  });

  it('a valid MCP request is served entirely in-process, with no outbound HTTP request carrying the token to any other service', async () => {
    // Arrange: any undici-based outbound call (fetch, undici.request) made
    // by *this process* while handling the request below would need an
    // interceptor registered on this MockAgent or it throws -- proving no
    // such call is attempted. The test's own request to the local server
    // uses Node's core `http` module (postMcp, above), which never touches
    // undici's dispatcher, so this only guards the server's own handling.
    const originalDispatcher = getGlobalDispatcher();
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    const voter = await makeVoter(harness.db, 'creator');
    const token = await signAccessToken(
      voter.id,
      { secret: harness.config.jwtSecret, issuer: harness.config.jwtIssuer },
      mcpResourceIdentifier(harness.config.apiBaseUrl),
    );

    try {
      // Act
      const response = await postMcp({ Authorization: `Bearer ${token}` }, initializeBody);

      // Assert
      expect(response.status).toBe(200);
    } finally {
      setGlobalDispatcher(originalDispatcher);
      await mockAgent.close();
    }
  });
});
