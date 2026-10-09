import { beforeEach, describe, expect, it } from 'vitest';
import { deleteWarRow, deleteWarRowIn, findWarById, markWarRemoved } from '../../src/wars/warsRepository.js';
import { makeDraftWarWithContestants, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('warsRepository removal (war-spec.md §6.7)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('hides a removed War from findWarById', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
    await markWarRemoved(harness.db, war.id);

    // Act
    const found = await findWarById(harness.db, war.id);

    // Assert
    expect(found).toBeUndefined();
  });

  it('deleteWarRow standalone deletes the War with its matchups and media rows', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);

    // Act
    await deleteWarRow(harness.db, war.id);

    // Assert
    expect(await harness.db.selectFrom('wars').selectAll().execute()).toHaveLength(0);
    expect(await harness.db.selectFrom('matchups').selectAll().execute()).toHaveLength(0);
    expect(await harness.db.selectFrom('contestant_media').selectAll().execute()).toHaveLength(0);
  });

  it('deleteWarRowIn joins the caller transaction, so rolling it back keeps the War', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);

    // Act
    await harness.db
      .transaction()
      .execute(async (trx) => {
        await deleteWarRowIn(trx, war.id);
        throw new Error('roll back');
      })
      .catch(() => undefined);

    // Assert
    expect(await harness.db.selectFrom('wars').selectAll().execute()).toHaveLength(1);
    expect(await harness.db.selectFrom('contestants').selectAll().execute()).toHaveLength(2);
  });
});
