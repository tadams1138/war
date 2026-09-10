import { describe, expect, it, beforeEach } from 'vitest';
import { listWarsForVoter } from '../../src/wars/warsService.js';
import { makeVoter, makeDraftWar } from '../setup/fixtures.js';
import { getTestDb, truncateAll } from '../setup/testDb.js';

/**
 * `listWarsForVoter` (spec §7.9: "list_my_wars's function is new") — a thin
 * wrapper around `warsRepository.listWars` with `creatorId` fixed to the
 * given voter, added so the MCP `list_my_wars` tool has a *service*-layer
 * function to call (an MCP tool has no route handler to decide `creatorId`
 * for it, unlike `GET /wars?creator=me`). `GET /wars` itself is untouched
 * and keeps calling `listWars` directly.
 */
describe('listWarsForVoter (spec §7.9)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('returns every status the voter created, including drafts, with no arguments', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator');
    const draft = await makeDraftWar(db, voter.id, { title: 'Draft War' });
    const inviteOnlyDraft = await makeDraftWar(db, voter.id, { title: 'Invite Only Draft', visibility: 'invite_only' });

    // Act
    const wars = await listWarsForVoter(db, voter.id);

    // Assert
    expect(wars.map((war) => war.id).sort()).toEqual([draft.id, inviteOnlyDraft.id].sort());
  });

  it('does not return another voter\'s Wars', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'lonely-voter');
    const other = await makeVoter(db, 'other-voter');
    await makeDraftWar(db, other.id, { title: "Someone Else's War" });

    // Act
    const wars = await listWarsForVoter(db, voter.id);

    // Assert
    expect(wars).toEqual([]);
  });

  it('composes with an explicit status filter, exactly as GET /wars?creator=me does', async () => {
    // Arrange
    const db = await getTestDb();
    const voter = await makeVoter(db, 'creator-2');
    const draft1 = await makeDraftWar(db, voter.id, { title: 'Draft War' });
    const draft2 = await makeDraftWar(db, voter.id, { title: 'Another Draft War' });

    // Act
    const wars = await listWarsForVoter(db, voter.id, { status: 'draft', limit: 1 });

    // Assert
    expect(wars).toHaveLength(1);
    expect([draft1.id, draft2.id]).toContain(wars[0]!.id);
  });
});
