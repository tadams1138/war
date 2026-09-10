import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decoyCodeChallenge, generateAuthorizationCode, hashAuthorizationCode } from '../../src/oauth/authorizationCodes.js';

describe('generateAuthorizationCode', () => {
  it('produces a unique opaque value each call', () => {
    // Arrange & Act
    const a = generateAuthorizationCode();
    const b = generateAuthorizationCode();

    // Assert
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('hashAuthorizationCode', () => {
  it('is a deterministic SHA-256 hex digest', () => {
    // Arrange
    const value = 'an-authorization-code';
    const expected = createHash('sha256').update(value).digest('hex');

    // Act
    const hash = hashAuthorizationCode(value);

    // Assert
    expect(hash).toBe(expected);
  });
});

describe('decoyCodeChallenge', () => {
  it('produces a different value each call, so it never accidentally matches a real challenge twice', () => {
    // Arrange & Act
    const a = decoyCodeChallenge();
    const b = decoyCodeChallenge();

    // Assert
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
