import { describe, expect, it } from 'vitest';
import { mcpResourceIdentifier } from '../../src/oauth/resource.js';
import { authorizationServerMetadata, protectedResourceMetadata } from '../../src/oauth/metadata.js';

const apiBaseUrl = 'https://api.test';

describe('mcpResourceIdentifier (spec §4.3.2: the one resource this deployment serves)', () => {
  it('is the API base URL with /api/v1/mcp appended', () => {
    // Arrange & Act
    const resource = mcpResourceIdentifier(apiBaseUrl);

    // Assert
    expect(resource).toBe('https://api.test/api/v1/mcp');
  });
});

describe('authorizationServerMetadata (spec §4.3.5, RFC 8414)', () => {
  it('names the issuer, authorization_endpoint, and token_endpoint', () => {
    // Arrange & Act
    const metadata = authorizationServerMetadata(apiBaseUrl);

    // Assert
    expect(metadata.issuer).toBe(apiBaseUrl);
    expect(metadata.authorization_endpoint).toBe('https://api.test/api/v1/oauth/authorize');
    expect(metadata.token_endpoint).toBe('https://api.test/api/v1/oauth/token');
  });

  it('advertises S256 as a supported PKCE method', () => {
    // Arrange & Act
    const metadata = authorizationServerMetadata(apiBaseUrl);

    // Assert
    expect(metadata.code_challenge_methods_supported).toContain('S256');
  });

  it('advertises Client ID Metadata Document support (slice 1 registration mechanism)', () => {
    // Arrange & Act
    const metadata = authorizationServerMetadata(apiBaseUrl);

    // Assert
    expect(metadata.client_id_metadata_document_supported).toBe(true);
  });
});

describe('protectedResourceMetadata (spec §4.3.5, RFC 9728)', () => {
  it('names this deployment\'s resource identifier and points at this API as its authorization server', () => {
    // Arrange & Act
    const metadata = protectedResourceMetadata(apiBaseUrl);

    // Assert
    expect(metadata.resource).toBe('https://api.test/api/v1/mcp');
    expect(metadata.authorization_servers).toEqual([apiBaseUrl]);
  });
});
