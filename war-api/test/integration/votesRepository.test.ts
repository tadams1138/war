import { describe, expect, it, beforeEach } from 'vitest';
import { castVote, findVote } from '../../src/votes/votesRepository.js';
import type { Matchup } from '../../src/matchups/matchupsRepository.js';
import { joinWarAsVoter, makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

/**
 * Regression test: two concurrent inserts for the same (matchup_id,
 * voter_id) must not both insert and must not double-increment the
 * counters. This needs the real UNIQUE constraint as arbiter, so it runs
 * against the real database rather than a mock.
 */
describe('castVote concurrency (war-spec.md §6.3, idempotent retry)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function setup(): Promise<{ matchup: Matchup; voterId: string }> {
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
    const published = await publishWarForTest(harness.db, war);
    const voter = await makeVoter(harness.db, 'voter');
    await joinWarAsVoter(harness.db, published.id, voter.id);
    const row = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', published.id).executeTakeFirstOrThrow();
    const matchup: Matchup = {
      id: row.id,
      warId: row.war_id,
      contestantAId: row.contestant_a_id,
      contestantBId: row.contestant_b_id,
    };
    return { matchup, voterId: voter.id };
  }

  it('lets only one of two concurrent same-winner inserts insert, without double-counting', async () => {
    // Arrange
    const { matchup, voterId } = await setup();
    const winnerId = matchup.contestantAId;

    // Act: two "requests" race to cast the same vote for the same voter.
    const [first, second] = await Promise.all([
      castVote(harness.db, matchup, voterId, winnerId, matchup.contestantAId),
      castVote(harness.db, matchup, voterId, winnerId, matchup.contestantAId),
    ]);

    // Assert: exactly one insert won.
    const results = [first, second].map((r) => {
      if ('banned' in r) throw new Error('voter unexpectedly banned');
      return r;
    });
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(results.filter((r) => !r.inserted)).toHaveLength(1);

    // Assert: exactly one Vote row exists, the loser's returned vote is that row, and findVote finds it.
    const rows = await harness.db.selectFrom('votes').selectAll().where('matchup_id', '=', matchup.id).execute();
    expect(rows).toHaveLength(1);
    for (const result of results) {
      expect(result.vote.id).toBe(rows[0]!.id);
    }
    const found = await findVote(harness.db, matchup.id, voterId);
    expect(found?.winnerId).toBe(winnerId);

    // Assert: the counters moved once, not twice.
    const winner = await harness.db.selectFrom('contestants').selectAll().where('id', '=', winnerId).executeTakeFirstOrThrow();
    expect(winner.win_count).toBe(1);
    const both = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', matchup.warId).execute();
    for (const row of both) {
      expect(row.appearance_count).toBe(1);
    }
  });
});
