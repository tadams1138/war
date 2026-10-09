import { describe, expect, it, beforeEach } from 'vitest';
import { setVoterRole, findVoterById } from '../../src/auth/votersRepository.js';
import { UNKNOWN_ID, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('setVoterRole (war-spec.md §3, §6.7)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('grants and revokes the admin role independently of the moderator role', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'voter');

    // Act
    await setVoterRole(harness.db, voter.id, 'admin', true);
    const afterGrant = await findVoterById(harness.db, voter.id);
    await setVoterRole(harness.db, voter.id, 'admin', false);
    const afterRevoke = await findVoterById(harness.db, voter.id);

    // Assert
    expect(afterGrant?.isAdmin).toBe(true);
    expect(afterGrant?.isModerator).toBe(false);
    expect(afterRevoke?.isAdmin).toBe(false);
  });

  it('returns undefined for a voter id that does not exist', async () => {
    // Arrange
    const voterId = UNKNOWN_ID;

    // Act
    const result = await setVoterRole(harness.db, voterId, 'moderator', true);

    // Assert
    expect(result).toBeUndefined();
  });
});
