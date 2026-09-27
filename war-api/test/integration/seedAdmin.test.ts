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

  it('returns undefined for a voter id that does not exist', async () => {
    // Act
    const result = await seedAdmin(harness.db, '00000000-0000-0000-0000-000000000000');

    // Assert
    expect(result).toBeUndefined();
  });
});
