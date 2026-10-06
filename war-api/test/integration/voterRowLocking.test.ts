import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findVoterById, findVoterByIdForUpdate, setVoterBanned, setVoterRole } from '../../src/auth/votersRepository.js';
import type { Matchup } from '../../src/matchups/matchupsRepository.js';
import { grantRole } from '../../src/roles/rolesService.js';
import { changeBan, changeSuspension } from '../../src/voterModeration/voterModerationService.js';
import { castVote } from '../../src/votes/votesRepository.js';
import { joinWarAsVoter, makeAdmin, makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

/**
 * The two narrow races of Suspend/Ban (war-spec.md §6.7), made deterministic:
 * each test holds one side's transaction open, proves the other side is
 * genuinely waiting on a row lock (a not-granted lock in `pg_locks`, not a
 * timer guess), then lets the first side commit and checks the outcome.
 */
describe('voter row locking (war-spec.md §6.7)', () => {
  let harness: TestHarness;

  const openHolds: { release: () => void; finished: Promise<unknown> }[] = [];

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  afterEach(async () => {
    // A failed assertion must not leave a transaction open, or the next truncate would wait on its locks forever.
    for (const hold of openHolds.splice(0)) {
      hold.release();
      await hold.finished.catch(() => undefined);
    }
  });

  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  /** Resolves once `count` distinct backends wait on a lock; rejects after 3s so a missing lock fails fast instead of hanging. */
  async function waitForBlockedBackends(count: number): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await sql<{ waiting: string }>`SELECT count(DISTINCT pid) AS waiting FROM pg_locks WHERE NOT granted`.execute(harness.db);
      if (Number(result.rows[0]!.waiting) >= count) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`fewer than ${count} backends ended up waiting on a lock`);
  }

  /** Opens a transaction, runs `acquire` in it, then keeps it open until the returned `commit()` is called. */
  async function holdTransaction(acquire: (trx: TestHarness['db']) => Promise<unknown>): Promise<{ commit: () => Promise<void> }> {
    const release = deferred();
    const acquired = deferred();
    const finished = harness.db.transaction().execute(async (trx) => {
      await acquire(trx);
      acquired.resolve();
      await release.promise;
    });
    openHolds.push({ release: release.resolve, finished });
    await Promise.race([acquired.promise, finished]);
    return {
      commit: async () => {
        release.resolve();
        await finished;
      },
    };
  }

  async function publishedMatchupWithJoinedVoter(): Promise<{ matchup: Matchup; voterId: string }> {
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
    const published = await publishWarForTest(harness.db, war);
    const voter = await makeVoter(harness.db, 'voter');
    await joinWarAsVoter(harness.db, published.id, voter.id);
    const row = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', published.id).executeTakeFirstOrThrow();
    return {
      matchup: { id: row.id, warId: row.war_id, contestantAId: row.contestant_a_id, contestantBId: row.contestant_b_id },
      voterId: voter.id,
    };
  }

  it('rejects a vote that was waiting on an uncommitted ban, and leaves no vote row', async () => {
    // Arrange
    const { matchup, voterId } = await publishedMatchupWithJoinedVoter();
    const ban = await holdTransaction((trx) => setVoterBanned(trx, voterId, true));

    // Act
    const vote = castVote(harness.db, matchup, voterId, matchup.contestantAId, matchup.contestantAId);
    await waitForBlockedBackends(1);
    await ban.commit();
    const result = await vote;

    // Assert
    expect(result).toEqual({ banned: true });
    expect(await harness.db.selectFrom('votes').selectAll().execute()).toHaveLength(0);
  });

  it('lets a vote that locked the voter first commit, and the ban then purges it', async () => {
    // Arrange
    const { matchup, voterId } = await publishedMatchupWithJoinedVoter();
    const admin = await makeAdmin(harness.db, 'admin');
    // Holding the winner's row makes the vote stall after it has taken its lock on the voter.
    const stall = await holdTransaction((trx) =>
      trx.selectFrom('contestants').select('id').where('id', '=', matchup.contestantAId).forUpdate().execute(),
    );

    // Act
    const vote = castVote(harness.db, matchup, voterId, matchup.contestantAId, matchup.contestantAId);
    await waitForBlockedBackends(1);
    const ban = changeBan(harness.db, harness.storage, harness.app.log, admin.id, voterId, true);
    await waitForBlockedBackends(2);
    await stall.commit();
    const voteResult = await vote;
    const banOutcome = await ban;

    // Assert
    expect(voteResult).toMatchObject({ inserted: true });
    expect(banOutcome.kind).toBe('ok');
    expect(await harness.db.selectFrom('votes').selectAll().execute()).toHaveLength(0);
    expect((await findVoterById(harness.db, voterId))?.banned).toBe(true);
  });

  it('refuses to suspend a Voter whose Moderator grant is still uncommitted, once it commits', async () => {
    // Arrange
    const caller = await makeAdmin(harness.db, 'caller');
    const target = await makeVoter(harness.db, 'target');
    const grant = await holdTransaction((trx) => setVoterRole(trx, target.id, 'moderator', true));

    // Act
    const suspension = changeSuspension(harness.db, caller.id, target.id, true);
    await waitForBlockedBackends(1);
    await grant.commit();
    const outcome = await suspension;

    // Assert
    expect(outcome.kind).toBe('forbidden');
    expect((await findVoterById(harness.db, target.id))?.suspended).toBe(false);
  });

  it('makes a role grant wait for a moderation lookup that locked the target first', async () => {
    // Arrange
    const admin = await makeAdmin(harness.db, 'admin');
    const target = await makeVoter(harness.db, 'target');
    const lookup = await holdTransaction((trx) => findVoterByIdForUpdate(trx, target.id));

    // Act
    const grant = grantRole(harness.db, admin.id, target.id, 'moderator', true);
    await waitForBlockedBackends(1);
    await lookup.commit();
    const outcome = await grant;

    // Assert
    expect(outcome.kind).toBe('ok');
    expect((await findVoterById(harness.db, target.id))?.isModerator).toBe(true);
  });
});
