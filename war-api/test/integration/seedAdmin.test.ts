import { describe, expect, it, beforeEach } from 'vitest';
import { seedAdmin } from '../../scripts/seedAdmin.js';
import { makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('seedAdmin (war-spec.md §6.7, first-Admin bootstrap)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('grants the admin role to the given voter id', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'first-admin');

    // Act
    const result = await seedAdmin(harness.db, voter.id);

    // Assert
    expect(result?.isAdmin).toBe(true);
  });

  // The unknown-voter case is `setVoterRole`'s behaviour, which seedAdmin delegates to unchanged;
  // it is covered in votersRepository.test.ts.
});
