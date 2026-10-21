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
      actorVoterId: staff.id,
      targetWarId: war.id,
    });
    await deleteWarRow(harness.db, war.id);

    // Assert
    const outcome = await listModerationLog(harness.db, { limit: 10, visibility: { moderation: true, roleChange: true } });
    expect(outcome.kind).toBe('ok');
    const entries = outcome.kind === 'ok' ? outcome.entries : [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.targetWarId).toBe(war.id);
  });

  it('shows a reader holding both roles the moderation and the role-change entries', async () => {
    // Arrange
    const actor = await makeVoter(harness.db, 'actor');
    await logAction(harness.db, { action: 'grant_role_moderator', actorVoterId: actor.id, targetVoterId: actor.id });
    await logAction(harness.db, { action: 'ban_voter', actorVoterId: actor.id, targetVoterId: actor.id });

    // Act
    const both = await listModerationLog(harness.db, { limit: 10, visibility: { moderation: true, roleChange: true } });
    const moderationOnly = await listModerationLog(harness.db, { limit: 10, visibility: { moderation: true, roleChange: false } });
    const roleChangeOnly = await listModerationLog(harness.db, { limit: 10, visibility: { moderation: false, roleChange: true } });

    // Assert
    const actions = (outcome: typeof both) => (outcome.kind === 'ok' ? outcome.entries.map((entry) => entry.action) : []);
    expect(actions(both)).toEqual(['ban_voter', 'grant_role_moderator']);
    expect(actions(moderationOnly)).toEqual(['ban_voter']);
    expect(actions(roleChangeOnly)).toEqual(['grant_role_moderator']);
  });
});
