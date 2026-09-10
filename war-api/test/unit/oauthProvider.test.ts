import { describe, expect, it } from 'vitest';
import { isCanonicalResource } from '../../src/oauth/provider.js';

const apiBaseUrl = 'https://api.test';

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
