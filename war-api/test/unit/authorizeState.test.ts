import { describe, expect, it } from 'vitest';
import { signPendingAuthorization, verifyPendingAuthorization } from '../../src/oauth/authorizeState.js';

const jwt = { secret: 'unit-test-secret', issuer: 'war-api-test' };

describe('pending authorization state (spec §4.3.2: carries the third-party request across the Google round trip)', () => {
  it('round-trips every field through sign and verify', async () => {
    // Arrange
    const pending = {
      clientId: 'https://client.test/metadata.json',
      redirectUri: 'https://client.test/callback',
      codeChallenge: 'a-challenge',
      resource: 'https://api.test/api/v1/mcp',
      state: 'third-party-state',
    };

    // Act
    const token = await signPendingAuthorization(pending, jwt);
    const verified = await verifyPendingAuthorization(token, jwt);

    // Assert
    expect(verified).toEqual(pending);
  });

  it('round-trips with no third-party state present (state is optional per RFC 6749)', async () => {
    // Arrange
    const pending = {
      clientId: 'https://client.test/metadata.json',
      redirectUri: 'https://client.test/callback',
      codeChallenge: 'a-challenge',
      resource: 'https://api.test/api/v1/mcp',
    };

    // Act
    const token = await signPendingAuthorization(pending, jwt);
    const verified = await verifyPendingAuthorization(token, jwt);

    // Assert
    expect(verified.state).toBeUndefined();
  });

  it('rejects a token signed with a different secret (tamper detection)', async () => {
    // Arrange
    const pending = {
      clientId: 'https://client.test/metadata.json',
      redirectUri: 'https://client.test/callback',
      codeChallenge: 'a-challenge',
      resource: 'https://api.test/api/v1/mcp',
    };
    const token = await signPendingAuthorization(pending, { secret: 'other-secret', issuer: jwt.issuer });

    // Act & Assert
    await expect(verifyPendingAuthorization(token, jwt)).rejects.toThrow();
  });

  it('rejects a malformed token', async () => {
    // Act & Assert
    await expect(verifyPendingAuthorization('not-a-jwt', jwt)).rejects.toThrow();
  });
});
