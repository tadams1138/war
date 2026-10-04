import { describe, expect, it, beforeEach } from 'vitest';
import { findVoterById } from '../../src/auth/votersRepository.js';
import { newId } from '../../src/db/uuid.js';
import { grantRole } from '../../src/roles/rolesService.js';
import { makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('rolesService (war-spec.md §6.7)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('leaves the role unchanged when its moderation log entry cannot be written', async () => {
    // Arrange
    const target = await makeVoter(harness.db, 'target');
    const callerWithNoVoterRow = newId();

    // Act
    const attempt = grantRole(harness.db, callerWithNoVoterRow, target.id, 'moderator', true);

    // Assert
    await expect(attempt).rejects.toThrow();
    const after = await findVoterById(harness.db, target.id);
    expect(after?.isModerator).toBe(false);
  });
});
