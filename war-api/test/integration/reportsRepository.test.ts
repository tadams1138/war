import { describe, expect, it, beforeEach } from 'vitest';
import {
  createReport,
  listWarsWithUnaddressedReports,
  setReportAddressed,
} from '../../src/reports/reportsRepository.js';
import { deleteWarRow } from '../../src/wars/warsRepository.js';
import { makeDraftWar, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('reportsRepository (war-spec.md §8.5)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('lists only Wars carrying at least one unaddressed report, with the right count each', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const reporter = await makeVoter(harness.db, 'reporter');
    const warWithUnaddressed = await makeDraftWar(harness.db, creator.id, { title: 'Needs review' });
    const warFullyAddressed = await makeDraftWar(harness.db, creator.id, { title: 'All clear' });
    await createReport(harness.db, { warId: warWithUnaddressed.id, reporterId: reporter.id, explanation: 'a' });
    await createReport(harness.db, { warId: warWithUnaddressed.id, reporterId: reporter.id, explanation: 'b' });
    const reportC = await createReport(harness.db, { warId: warFullyAddressed.id, reporterId: reporter.id, explanation: 'c' });
    await setReportAddressed(harness.db, reportC.id, true);

    // Act
    const queue = await listWarsWithUnaddressedReports(harness.db);

    // Assert
    expect(queue).toEqual([{ warId: warWithUnaddressed.id, title: 'Needs review', unaddressedCount: 2 }]);
  });

  it('is removed entirely when its War is deleted (war-spec.md §8.5, no FK cascade on reports.war_id)', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const reporter = await makeVoter(harness.db, 'reporter');
    const war = await makeDraftWar(harness.db, creator.id);
    await createReport(harness.db, { warId: war.id, reporterId: reporter.id, explanation: 'an issue' });

    // Act
    await deleteWarRow(harness.db, war.id);

    // Assert
    const remaining = await harness.db.selectFrom('reports').selectAll().where('war_id', '=', war.id).execute();
    expect(remaining).toHaveLength(0);
  });
});
