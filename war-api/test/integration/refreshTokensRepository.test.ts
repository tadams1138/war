import { describe, expect, it, beforeEach } from 'vitest';
import { createRefreshTokenFamily, findRefreshTokenByHash, rotateRefreshToken } from '../../src/auth/refreshTokensRepository.js';
import { generateRefreshTokenValue, hashRefreshToken } from '../../src/auth/refreshTokens.js';
import { makeVoter } from '../setup/fixtures.js';
import { getTestDb, truncateAll } from '../setup/testDb.js';

/**
 * Repository-level regression test for design review finding 1: two
 * concurrent presentations of the same refresh token must not both rotate.
 * The DB is the arbiter here, so this needs the real database rather than a
 * mock — a check-then-act race is invisible to a sequential test.
 */
describe('rotateRefreshToken concurrency (spec §5.2 reuse detection)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('lets only one of two concurrent rotations of the same token succeed', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'racer');
    const initialValue = generateRefreshTokenValue();
    const stored = await createRefreshTokenFamily(db, voter.id, hashRefreshToken(initialValue));

    // Act: two "requests" race to rotate the very same stored token.
    const [first, second] = await Promise.all([
      rotateRefreshToken(db, stored, hashRefreshToken(generateRefreshTokenValue())),
      rotateRefreshToken(db, stored, hashRefreshToken(generateRefreshTokenValue())),
    ]);

    // Assert: exactly one of the two attempts won the race.
    const outcomes = [first, second];
    const winners = outcomes.filter((outcome) => outcome.kind === 'rotated');
    const losers = outcomes.filter((outcome) => outcome.kind === 'lost-race');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Assert: only one successor token exists in the family beyond the original.
    const successors = await db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('family_id', '=', stored.familyId)
      .where('id', '!=', stored.id)
      .execute();
    expect(successors).toHaveLength(1);
  });

  it('marks the original token used exactly once even when raced', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'racer-2');
    const initialValue = generateRefreshTokenValue();
    const stored = await createRefreshTokenFamily(db, voter.id, hashRefreshToken(initialValue));

    // Act
    await Promise.all([
      rotateRefreshToken(db, stored, hashRefreshToken(generateRefreshTokenValue())),
      rotateRefreshToken(db, stored, hashRefreshToken(generateRefreshTokenValue())),
    ]);

    // Assert
    const original = await findRefreshTokenByHash(db, hashRefreshToken(initialValue));
    expect(original?.usedAt).not.toBeNull();
  });
});

/**
 * Design review of 513ee16, Finding 1(b): a family's `resource` binding
 * (spec §4.2, §4.3.7) is set once at issuance and must survive rotation
 * unchanged, on both the ordinary NULL case and an AS-bound family.
 */
describe('rotateRefreshToken carries `resource` forward (spec §4.3.7)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('carries a bound resource forward onto the rotated successor', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'resource-carrier');
    const initialValue = generateRefreshTokenValue();
    const stored = await createRefreshTokenFamily(db, voter.id, hashRefreshToken(initialValue), 'https://api.test/api/v1/mcp');

    // Act
    const result = await rotateRefreshToken(db, stored, hashRefreshToken(generateRefreshTokenValue()));

    // Assert
    expect(result.kind).toBe('rotated');
    expect(result.kind === 'rotated' && result.token.resource).toBe('https://api.test/api/v1/mcp');
  });

  it('leaves an ordinary (NULL-resource) family NULL after rotation', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'null-resource-carrier');
    const initialValue = generateRefreshTokenValue();
    const stored = await createRefreshTokenFamily(db, voter.id, hashRefreshToken(initialValue));

    // Act
    const result = await rotateRefreshToken(db, stored, hashRefreshToken(generateRefreshTokenValue()));

    // Assert
    expect(result.kind).toBe('rotated');
    expect(result.kind === 'rotated' && result.token.resource).toBeNull();
  });
});
