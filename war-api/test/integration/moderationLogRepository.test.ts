import { describe, expect, it, beforeEach } from 'vitest';
import { logAction, listModerationLog } from '../../src/moderation/moderationLogRepository.js';
import { deleteWarRow } from '../../src/wars/warsRepository.js';
import { makeDraftWar, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('moderationLogRepository (war-spec.md §6.7)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('persists log entries after their target War is deleted (append-only, no FK cascade)', async () => {
    // Arrange
    const staff = await makeVoter(harness.db, 'staff');
    const creator = await makeVoter(harness.db, 'creator');
    const war = await makeDraftWar(harness.db, creator.id);

    // Act
    await logAction(harness.db, {
      action: 'warn_war',
      staffVoterId: staff.id,
      targetWarId: war.id,
    });
    await deleteWarRow(harness.db, war.id);

    // Assert
    const outcome = await listModerationLog(harness.db, { limit: 10 });
    expect(outcome.kind).toBe('ok');
    const entries = outcome.kind === 'ok' ? outcome.entries : [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.targetWarId).toBe(war.id);
  });
});
