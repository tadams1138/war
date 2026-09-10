import { describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { isCanonicalResource, WarOAuthServerProvider } from '../../src/oauth/provider.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import type { GoogleAuthProvider } from '../../src/auth/googleProvider.js';
import type { Database } from '../../src/db/types.js';

const apiBaseUrl = 'https://api.test';
const jwtOptions = { secret: 'test-secret', issuer: 'war-api' };
const resource = 'https://api.test/api/v1/mcp';

/** verifyAccessToken never touches `db`/`google` -- both are cast rather than faked. */
function buildProvider(): WarOAuthServerProvider {
  return new WarOAuthServerProvider({
    db: {} as Kysely<Database>,
    google: {} as GoogleAuthProvider,
    jwt: jwtOptions,
    apiBaseUrl,
    googleOAuthRedirectUri: 'https://api.test/api/v1/oauth/google/callback',
  });
}

describe('isCanonicalResource (spec §4.3.2, §4.3.4: the one resource this deployment issues tokens for)', () => {
  it('accepts exactly this deployment\'s MCP resource identifier', () => {
    // Arrange & Act
    const result = isCanonicalResource('https://api.test/api/v1/mcp', apiBaseUrl);

    // Assert
    expect(result).toBe(true);
  });

  it('rejects a resource this deployment does not serve', () => {
    // Arrange & Act
    const result = isCanonicalResource('https://someone-elses-api.test/api/v1/mcp', apiBaseUrl);

    // Assert
    expect(result).toBe(false);
  });

  it('rejects an absent resource', () => {
    // Arrange & Act
    const result = isCanonicalResource(undefined, apiBaseUrl);

    // Assert
    expect(result).toBe(false);
  });
});

describe('WarOAuthServerProvider.verifyAccessToken (spec §4.3.6: the resource server bearer check protecting /api/v1/mcp)', () => {
  it('rejects a token carrying no audience at all -- the browser flow\'s own token shape, never valid here', async () => {
    // Arrange
    const provider = buildProvider();
    const token = await signAccessToken('voter-1', jwtOptions);

    // Act & Assert
    await expect(provider.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects a token whose audience names a different resource', async () => {
    // Arrange
    const provider = buildProvider();
    const token = await signAccessToken('voter-1', jwtOptions, 'https://someone-elses-api.test/api/v1/mcp');

    // Act & Assert
    await expect(provider.verifyAccessToken(token)).rejects.toThrow();
  });

  it('accepts a token correctly audienced for this resource and carries the voter id into AuthInfo.extra', async () => {
    // Arrange
    const provider = buildProvider();
    const token = await signAccessToken('voter-1', jwtOptions, resource);

    // Act
    const authInfo = await provider.verifyAccessToken(token);

    // Assert
    expect(authInfo.resource?.href).toBe(resource);
    expect(authInfo.extra).toEqual({ voterId: 'voter-1' });
  });
});
