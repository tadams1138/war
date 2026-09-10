import { describe, expect, it, beforeEach } from 'vitest';
import {
  claimAuthorizationCode,
  createAuthorizationCode,
  findAuthorizationCodeByHash,
} from '../../src/oauth/authorizationCodesRepository.js';
import { generateAuthorizationCode, hashAuthorizationCode } from '../../src/oauth/authorizationCodes.js';
import { makeVoter } from '../setup/fixtures.js';
import { getTestDb, truncateAll } from '../setup/testDb.js';

const RESOURCE = 'https://api.test/api/v1/mcp';

describe('authorizationCodesRepository', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('claims an unused, unexpired code exactly once and returns its stored fields', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'coder');
    const plaintext = generateAuthorizationCode();
    await createAuthorizationCode(db, {
      voterId: voter.id,
      clientId: 'https://client.test/client-metadata.json',
      codeHash: hashAuthorizationCode(plaintext),
      codeChallenge: 'the-real-challenge',
      redirectUri: 'https://client.test/callback',
      resource: RESOURCE,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Act
    const claimed = await claimAuthorizationCode(db, hashAuthorizationCode(plaintext));

    // Assert
    expect(claimed).toBeDefined();
    expect(claimed?.codeChallenge).toBe('the-real-challenge');
    expect(claimed?.voterId).toBe(voter.id);
    expect(claimed?.resource).toBe(RESOURCE);
  });

  it('refuses to claim the same code a second time (single-use, spec §4.3.4)', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'coder2');
    const plaintext = generateAuthorizationCode();
    await createAuthorizationCode(db, {
      voterId: voter.id,
      clientId: 'https://client.test/client-metadata.json',
      codeHash: hashAuthorizationCode(plaintext),
      codeChallenge: 'the-real-challenge',
      redirectUri: 'https://client.test/callback',
      resource: RESOURCE,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Act
    const first = await claimAuthorizationCode(db, hashAuthorizationCode(plaintext));
    const second = await claimAuthorizationCode(db, hashAuthorizationCode(plaintext));

    // Assert
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });

  it('refuses to claim an expired code', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'coder3');
    const plaintext = generateAuthorizationCode();
    await createAuthorizationCode(db, {
      voterId: voter.id,
      clientId: 'https://client.test/client-metadata.json',
      codeHash: hashAuthorizationCode(plaintext),
      codeChallenge: 'the-real-challenge',
      redirectUri: 'https://client.test/callback',
      resource: RESOURCE,
      expiresAt: new Date(Date.now() - 1000),
    });

    // Act
    const claimed = await claimAuthorizationCode(db, hashAuthorizationCode(plaintext));

    // Assert
    expect(claimed).toBeUndefined();
  });

  it('lets only one of two concurrent claims of the same code succeed', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'racer');
    const plaintext = generateAuthorizationCode();
    await createAuthorizationCode(db, {
      voterId: voter.id,
      clientId: 'https://client.test/client-metadata.json',
      codeHash: hashAuthorizationCode(plaintext),
      codeChallenge: 'the-real-challenge',
      redirectUri: 'https://client.test/callback',
      resource: RESOURCE,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Act: two "requests" race to claim the very same stored code.
    const [first, second] = await Promise.all([
      claimAuthorizationCode(db, hashAuthorizationCode(plaintext)),
      claimAuthorizationCode(db, hashAuthorizationCode(plaintext)),
    ]);

    // Assert
    const claimedCount = [first, second].filter((result) => result !== undefined).length;
    expect(claimedCount).toBe(1);
  });

  it('findAuthorizationCodeByHash finds a row regardless of used_at, for post-claim re-inspection', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'finder');
    const plaintext = generateAuthorizationCode();
    await createAuthorizationCode(db, {
      voterId: voter.id,
      clientId: 'https://client.test/client-metadata.json',
      codeHash: hashAuthorizationCode(plaintext),
      codeChallenge: 'the-real-challenge',
      redirectUri: 'https://client.test/callback',
      resource: RESOURCE,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await claimAuthorizationCode(db, hashAuthorizationCode(plaintext));

    // Act
    const found = await findAuthorizationCodeByHash(db, hashAuthorizationCode(plaintext));

    // Assert
    expect(found).toBeDefined();
    expect(found?.usedAt).not.toBeNull();
  });
});
