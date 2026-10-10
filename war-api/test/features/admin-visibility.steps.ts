import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { sql } from 'kysely';
import { expect } from 'vitest';
import { newId } from '../../src/db/uuid.js';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { generateMatchupsForNewContestant } from '../../src/matchups/matchupsRepository.js';
import { setVoterBanned, setVoterSuspended } from '../../src/auth/votersRepository.js';
import { expireWar, makeAdmin, makeContestant, makeDraftWar, makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { anonymous } from '../setup/apiClient.js';
import { moderationLog } from '../setup/queries.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/admin-visibility.feature', import.meta.url)));

type Item = Record<string, unknown>;

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function getAs(callerId: string, path: string, query: Record<string, string> = {}): Promise<request.Response> {
    await harness.app.ready();
    const jwt = await harness.jwtFor(callerId);
    return request(harness.app.server).get(`/api/v1${path}`).query(query).set('Authorization', `Bearer ${jwt}`);
  }

  async function setWarColumns(warId: string, columns: { status?: string; removed?: boolean }): Promise<void> {
    await harness.db
      .updateTable('wars')
      .set({
        ...(columns.status ? { status: columns.status } : {}),
        ...(columns.removed ? { removed_at: sql<Date>`now()` } : {}),
      })
      .where('id', '=', warId)
      .execute();
  }

  async function addReport(warId: string, reporterId: string, addressed: boolean): Promise<void> {
    await harness.db
      .insertInto('reports')
      .values({ id: newId(), war_id: warId, reporter_id: reporterId, explanation: 'bad', addressed })
      .execute();
  }

  interface SeededWars {
    creatorId: string;
    warIds: { draft: string; unlisted: string; closed: string; removed: string };
  }

  /** One creator with a draft, an unlisted (published), a closed (2 unaddressed + 1 addressed report) and a removed War, created in that order. */
  async function seedWarsOfEveryKind(): Promise<SeededWars> {
    const creatorId = (await makeVoter(harness.db, 'alice')).id;
    const draft = await makeDraftWar(harness.db, creatorId, { title: 'Draft War' });
    const unlisted = await makeDraftWar(harness.db, creatorId, { title: 'Unlisted War', visibility: 'unlisted' });
    const closed = await makeDraftWar(harness.db, creatorId, { title: 'Closed War' });
    const removed = await makeDraftWar(harness.db, creatorId, { title: 'Removed War' });
    await setWarColumns(unlisted.id, { status: 'published' });
    await setWarColumns(closed.id, { status: 'closed' });
    await setWarColumns(removed.id, { status: 'published', removed: true });
    await addReport(closed.id, creatorId, false);
    await addReport(closed.id, creatorId, false);
    await addReport(closed.id, creatorId, true);
    return { creatorId, warIds: { draft: draft.id, unlisted: unlisted.id, closed: closed.id, removed: removed.id } };
  }

  /** A published War whose end date passed a minute ago and which the close task has not touched, so its stored status still says published. */
  async function seedExpiredUnclosedWar(): Promise<{ creatorId: string; warId: string }> {
    const creatorId = (await makeVoter(harness.db, 'alice')).id;
    const war = await makeDraftWar(harness.db, creatorId, { title: 'Expired War' });
    await setWarColumns(war.id, { status: 'published' });
    await expireWar(harness.db, war.id);
    return { creatorId, warId: war.id };
  }

  Scenario('A Moderator lists every War whatever its status',({ Given, And, When, Then }) => {
    let creatorId: string;
    let warIds: { draft: string; unlisted: string; closed: string; removed: string };
    let moderatorId: string;
    let response: request.Response;

    Given(
      'a Voter who created a draft, an unlisted, a closed and a removed War, the closed one with 2 unaddressed and 1 addressed report',
      async () => {
        // Arrange
        ({ creatorId, warIds } = await seedWarsOfEveryKind());
      },
    );

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars');
    });

    Then('the response lists all 4 Wars newest first with their status, visibility, creator, removed_at and unaddressed report count', () => {
      // Assert
      expect(response.status).toBe(200);
      const wars = response.body.wars as Item[];
      expect(wars.map((war) => war.id)).toEqual([warIds.removed, warIds.closed, warIds.unlisted, warIds.draft]);
      expect(wars.map((war) => war.status)).toEqual(['published', 'closed', 'published', 'draft']);
      expect(wars.map((war) => war.visibility)).toEqual(['public', 'public', 'unlisted', 'public']);
      expect(wars.map((war) => war.unaddressed_report_count)).toEqual([0, 2, 0, 0]);
      expect(wars.map((war) => war.removed_at === null)).toEqual([false, true, true, true]);
      expect(Number.isNaN(Date.parse(wars[0]?.removed_at as string))).toBe(false);
      for (const war of wars) {
        expect(war.creator_id).toBe(creatorId);
        expect(war.creator_name).toBe('alice');
        expect(Number.isNaN(Date.parse(war.created_at as string))).toBe(false);
      }
      expect(response.body.next_cursor).toBeNull();
    });
  });

  ScenarioOutline('A Moderator narrows the admin Wars by status or title', ({ Given, And, When, Then }, variables) => {
    let warIds: SeededWars['warIds'];
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter who created a draft, an unlisted, a closed and a removed War', async () => {
      // Arrange
      ({ warIds } = await seedWarsOfEveryKind());
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars with <filter> "<value>"', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { [variables.filter as string]: variables.value as string });
    });

    Then('the response lists only the <expected> War', () => {
      // Assert
      expect(response.status).toBe(200);
      const expectedId = warIds[variables.expected as keyof SeededWars['warIds']];
      expect((response.body.wars as Item[]).map((war) => war.id)).toEqual([expectedId]);
    });
  });

  Scenario('Searching the admin Wars matches a creator name', ({ Given, And, When, Then }) => {
    let bobsWarId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter "alice" with a War and a Voter "bob" with a War', async () => {
      // Arrange
      const aliceId = (await makeVoter(harness.db, 'alice')).id;
      const bobId = (await makeVoter(harness.db, 'bob')).id;
      await makeDraftWar(harness.db, aliceId, { title: 'Alpha' });
      bobsWarId = (await makeDraftWar(harness.db, bobId, { title: 'Beta' })).id;
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars with q "BOB"', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { q: 'BOB' });
    });

    Then("the response lists only bob's War", () => {
      // Assert
      expect(response.status).toBe(200);
      expect((response.body.wars as Item[]).map((war) => war.id)).toEqual([bobsWarId]);
    });
  });

  Scenario('Searching the admin Wars lists a War matching on title and creator name once', ({ Given, And, When, Then }) => {
    let bothWarId: string;
    let titleOnlyWarId: string;
    let creatorOnlyWarId: string;
    let moderatorId: string;
    let response: request.Response;

    Given(
      'Voters "sam" and "tess" with Wars titled "Sam Rematch", "Sam Day" and "Other"',
      async () => {
        // Arrange
        const samId = (await makeVoter(harness.db, 'sam')).id;
        const tessId = (await makeVoter(harness.db, 'tess')).id;
        creatorOnlyWarId = (await makeDraftWar(harness.db, samId, { title: 'Other' })).id;
        titleOnlyWarId = (await makeDraftWar(harness.db, tessId, { title: 'Sam Day' })).id;
        bothWarId = (await makeDraftWar(harness.db, samId, { title: 'Sam Rematch' })).id;
      },
    );

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars with q "sam"', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { q: 'sam' });
    });

    Then('the response lists each of the three Wars exactly once, newest first', () => {
      // Assert
      expect(response.status).toBe(200);
      expect((response.body.wars as Item[]).map((war) => war.id)).toEqual([bothWarId, titleOnlyWarId, creatorOnlyWarId]);
    });
  });

  Scenario('Searching the admin Wars treats wildcard characters literally', ({ Given, And, When, Then }) => {
    let percentWarId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter with Wars titled "100% Cats" and "Dogs"', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'alice')).id;
      percentWarId = (await makeDraftWar(harness.db, creatorId, { title: '100% Cats' })).id;
      await makeDraftWar(harness.db, creatorId, { title: 'Dogs' });
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars with q "%"', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { q: '%' });
    });

    Then('the response lists only the War titled "100% Cats"', () => {
      // Assert
      expect(response.status).toBe(200);
      expect((response.body.wars as Item[]).map((war) => war.id)).toEqual([percentWarId]);
    });
  });

  /** Creates `count` Wars whose created_at differ only in microseconds; returns their ids newest first. */
  async function seedWarsWithinOneMillisecond(creatorId: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const war = await makeDraftWar(harness.db, creatorId, { title: `War ${i}` });
      const micros = String(i * 100).padStart(6, '0');
      await sql`update wars set created_at = ${`2026-01-01T00:00:00.${micros}Z`}::timestamptz where id = ${war.id}::uuid`.execute(harness.db);
      ids.push(war.id);
    }
    return ids.reverse();
  }

  /** Follows `next_cursor` until it is null (bounded), returning every page response. */
  async function pageThrough(callerId: string, path: string, limit: string): Promise<request.Response[]> {
    const pages: request.Response[] = [];
    let cursor: string | undefined;
    do {
      const page = await getAs(callerId, path, cursor ? { limit, cursor } : { limit });
      pages.push(page);
      cursor = (page.body.next_cursor as string | null) ?? undefined;
    } while (cursor && pages.length < 10);
    return pages;
  }

  Scenario('The admin Wars are returned a page at a time', ({ Given, And, When, Then }) => {
    let seededIds: string[];
    let moderatorId: string;
    let pages: request.Response[];

    Given('a Voter with 5 Wars created within the same millisecond', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'alice')).id;
      seededIds = await seedWarsWithinOneMillisecond(creatorId, 5);
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator pages through the admin Wars with limit 3 following each next cursor', async () => {
      // Act
      pages = await pageThrough(moderatorId, '/admin/wars', '3');
    });

    Then('there are 2 pages, every War appears exactly once newest first, and the last cursor is null', () => {
      // Assert
      expect(pages.map((page) => page.status)).toEqual([200, 200]);
      expect(pages.map((page) => (page.body.wars as Item[]).length)).toEqual([3, 2]);
      expect(pages.flatMap((page) => (page.body.wars as Item[]).map((war) => war.id))).toEqual(seededIds);
      expect(typeof pages[0]?.body.next_cursor).toBe('string');
      expect(pages[1]?.body.next_cursor).toBeNull();
    });
  });

  Scenario('A malformed cursor on the admin Wars is rejected', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars with cursor "not-a-cursor"', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { cursor: 'not-a-cursor' });
    });

    Then('the response is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  ScenarioOutline('A plain Voter cannot use the admin endpoints', ({ Given, When, Then }, variables) => {
    let voterId: string;
    let response: request.Response;

    Given('a plain Voter', async () => {
      // Arrange
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('that Voter GETs <path>', async () => {
      // Act
      response = await getAs(voterId, variables.path as string);
    });

    Then('the response is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });
  });

  ScenarioOutline('An unauthenticated caller cannot use the admin endpoints', ({ When, Then }, variables) => {
    let response: request.Response;

    When('an unauthenticated caller GETs <path>', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1${variables.path as string}`);
    });

    Then('the response is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });
  });

  Scenario('A Moderator views a removed War with its contestants and counters', ({ Given, And, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let contestantIds: string[];
    let moderatorId: string;
    let response: request.Response;

    Given(
      'a removed War with contestants "Ann" (3 wins, 5 appearances) and "Bea" (2 wins, 5 appearances) and 3 reports, 1 of them addressed',
      async () => {
        // Arrange
        creatorId = (await makeVoter(harness.db, 'alice')).id;
        const war = await makeDraftWar(harness.db, creatorId, { title: 'Gone War' });
        warId = war.id;
        const ann = await makeContestant(harness.db, warId, 'Ann');
        const bea = await makeContestant(harness.db, warId, 'Bea');
        contestantIds = [ann.id, bea.id];
        await harness.db.updateTable('contestants').set({ win_count: 3, appearance_count: 5 }).where('id', '=', ann.id).execute();
        await harness.db.updateTable('contestants').set({ win_count: 2, appearance_count: 5 }).where('id', '=', bea.id).execute();
        await addReport(warId, creatorId, false);
        await addReport(warId, creatorId, false);
        await addReport(warId, creatorId, true);
        await setWarColumns(warId, { status: 'published', removed: true });
      },
    );

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs that War from the admin endpoint', async () => {
      // Act
      response = await getAs(moderatorId, `/admin/wars/${warId}`);
    });

    Then('the response shows the removed War with its contestants in order, their counters, and 3 reports of which 2 are unaddressed', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: warId,
        title: 'Gone War',
        status: 'published',
        creator_id: creatorId,
        creator_name: 'alice',
        unaddressed_report_count: 2,
        report_count: 3,
      });
      expect(Number.isNaN(Date.parse(response.body.removed_at as string))).toBe(false);
      expect(response.body.contestants).toEqual([
        { id: contestantIds[0], name: 'Ann', win_count: 3, appearance_count: 5 },
        { id: contestantIds[1], name: 'Bea', win_count: 2, appearance_count: 5 },
      ]);
    });
  });

  ScenarioOutline('An unknown War or Voter is not found', ({ Given, When, Then }, variables) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs <path>', async () => {
      // Act
      response = await getAs(moderatorId, variables.path as string);
    });

    Then('the response is 404', () => {
      // Assert
      expect(response.status).toBe(404);
    });
  });

  Scenario('A Moderator lists every Voter with their War count', ({ Given, And, When, Then }) => {
    let aliceId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter "alice" who created 2 Wars, one of them removed', async () => {
      // Arrange
      aliceId = (await makeVoter(harness.db, 'alice')).id;
      await makeDraftWar(harness.db, aliceId, { title: 'Kept' });
      const removed = await makeDraftWar(harness.db, aliceId, { title: 'Gone' });
      await setWarColumns(removed.id, { status: 'published', removed: true });
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Voters', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/voters');
    });

    Then('the response lists the Moderator then alice, each with exactly the Voter fields and alice with a War count of 2', () => {
      // Assert
      expect(response.status).toBe(200);
      const voters = response.body.voters as Item[];
      expect(voters.map((voter) => voter.id)).toEqual([moderatorId, aliceId]);
      expect(Object.keys(voters[1] as Item).sort()).toEqual(
        ['avatar_url', 'banned', 'created_at', 'display_name', 'id', 'is_admin', 'is_moderator', 'suspended', 'war_count'].sort(),
      );
      expect(voters[1]).toMatchObject({
        display_name: 'alice',
        avatar_url: null,
        is_moderator: false,
        is_admin: false,
        suspended: false,
        banned: false,
        war_count: 2,
      });
      expect(voters[0]).toMatchObject({ is_moderator: true, war_count: 0 });
      expect(response.body.next_cursor).toBeNull();
    });
  });

  ScenarioOutline('A Moderator filters the Voters by status', ({ Given, And, When, Then }, variables) => {
    let moderatorId: string;
    let response: request.Response;

    Given('Voters alice, bob who is suspended, carol who is banned, and dave who is an Admin', async () => {
      // Arrange
      await makeVoter(harness.db, 'alice');
      await setVoterSuspended(harness.db, (await makeVoter(harness.db, 'bob')).id, true);
      await setVoterBanned(harness.db, (await makeVoter(harness.db, 'carol')).id, true);
      await makeAdmin(harness.db, 'dave');
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Voters with status <status>', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/voters', { status: variables.status as string });
    });

    Then('the response lists exactly <names> newest first', () => {
      // Assert
      expect(response.status).toBe(200);
      const names = (response.body.voters as Item[]).map((voter) => voter.display_name);
      expect(names).toEqual((variables.names as string).split(', '));
    });
  });

  ScenarioOutline('A Moderator searches the Voters by display name', ({ Given, And, When, Then }, variables) => {
    let moderatorId: string;
    let response: request.Response;

    Given('Voters named alice and 100%pure', async () => {
      // Arrange
      await makeVoter(harness.db, 'alice');
      await makeVoter(harness.db, '100%pure');
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Voters with q <q>', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/voters', { q: variables.q as string });
    });

    Then('the response lists exactly <name>', () => {
      // Assert
      expect(response.status).toBe(200);
      expect((response.body.voters as Item[]).map((voter) => voter.display_name)).toEqual([variables.name]);
    });
  });

  Scenario('The admin Voters are returned a page at a time', ({ Given, And, When, Then }) => {
    let seededIds: string[];
    let moderatorId: string;
    let pages: request.Response[];

    Given('5 Voters created within the same millisecond', async () => {
      // Arrange
      seededIds = [];
      for (let i = 1; i <= 5; i += 1) {
        const voter = await makeVoter(harness.db, `voter ${i}`);
        const micros = String(i * 100).padStart(6, '0');
        await sql`update voters set created_at = ${`2026-01-01T00:00:00.${micros}Z`}::timestamptz where id = ${voter.id}::uuid`.execute(harness.db);
        seededIds.unshift(voter.id);
      }
    });

    And('a Moderator who joined earlier', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      await sql`update voters set created_at = '2025-01-01T00:00:00Z'::timestamptz where id = ${moderatorId}::uuid`.execute(harness.db);
    });

    When('the Moderator pages through the admin Voters with limit 3 following each next cursor', async () => {
      // Act
      pages = await pageThrough(moderatorId, '/admin/voters', '3');
    });

    Then('there are 2 pages, every Voter appears exactly once newest first, and the last cursor is null', () => {
      // Assert
      expect(pages.map((page) => (page.body.voters as Item[]).length)).toEqual([3, 3]);
      expect(pages.flatMap((page) => (page.body.voters as Item[]).map((voter) => voter.id))).toEqual([...seededIds, moderatorId]);
      expect(pages[0]?.body.next_cursor).toEqual(expect.any(String));
      expect(pages[1]?.body.next_cursor).toBeNull();
    });
  });

  Scenario('A Moderator views a Voter with all their Wars including removed ones', ({ Given, And, When, Then }) => {
    let aliceId: string;
    let keptWarId: string;
    let removedWarId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a suspended Voter "alice" who created a kept War and then a removed War', async () => {
      // Arrange
      aliceId = (await makeVoter(harness.db, 'alice')).id;
      await setVoterSuspended(harness.db, aliceId, true);
      keptWarId = (await makeDraftWar(harness.db, aliceId, { title: 'Kept' })).id;
      removedWarId = (await makeDraftWar(harness.db, aliceId, { title: 'Gone' })).id;
      await setWarColumns(removedWarId, { status: 'published', removed: true });
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs that Voter from the admin endpoint', async () => {
      // Act
      response = await getAs(moderatorId, `/admin/voters/${aliceId}`);
    });

    Then('the response shows alice with a War count of 2 and both Wars newest first, the removed one with its removal time', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: aliceId, display_name: 'alice', suspended: true, banned: false, war_count: 2 });
      const wars = response.body.wars as Item[];
      expect(wars.map((war) => war.id)).toEqual([removedWarId, keptWarId]);
      expect(wars.map((war) => war.title)).toEqual(['Gone', 'Kept']);
      expect(wars.map((war) => war.status)).toEqual(['published', 'draft']);
      expect(Number.isNaN(Date.parse(wars[0]?.removed_at as string))).toBe(false);
      expect(wars[1]?.removed_at).toBeNull();
      expect(Object.keys(wars[0] as Item).sort()).toEqual(['id', 'removed_at', 'status', 'title']);
    });
  });

  interface SeededVote {
    voteId: string;
    warId: string;
    warTitle: string;
    matchupId: string;
    winnerId: string;
    loserId: string;
  }

  /** Creates a War by `creatorId` with a "<title> Winner" and a "<title> Loser" contestant, and records `voterId`'s vote for the winner at `castAt`. */
  async function castVoteInNewWar(
    voterId: string,
    creatorId: string,
    options: { title: string; castAt: string; visibility?: string; removed?: boolean },
  ): Promise<SeededVote> {
    const war = await makeDraftWar(harness.db, creatorId, { title: options.title, visibility: options.visibility });
    const loser = await makeContestant(harness.db, war.id, `${options.title} Loser`);
    const winner = await makeContestant(harness.db, war.id, `${options.title} Winner`);
    await generateMatchupsForNewContestant(harness.db, war.id, winner.id, [loser.id]);
    const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', war.id).executeTakeFirstOrThrow();
    const voteId = newId();
    await harness.db
      .insertInto('votes')
      .values({
        id: voteId,
        matchup_id: matchup.id,
        voter_id: voterId,
        winner_id: winner.id,
        presented_left_id: matchup.contestant_a_id,
        created_at: options.castAt,
      })
      .execute();
    if (options.removed) await setWarColumns(war.id, { status: 'published', removed: true });
    return { voteId, warId: war.id, warTitle: options.title, matchupId: matchup.id, winnerId: winner.id, loserId: loser.id };
  }

  Scenario('A Moderator reads a Voter\'s complete vote history', ({ Given, And, When, Then }) => {
    let voterId: string;
    let votes: SeededVote[];
    let moderatorId: string;
    let response: request.Response;

    Given(
      'a Voter who voted in a published War, then in another Voter\'s unlisted War, then in a War that was later removed',
      async () => {
        // Arrange
        voterId = (await makeVoter(harness.db, 'alice')).id;
        const creatorId = (await makeVoter(harness.db, 'bob')).id;
        votes = [
          await castVoteInNewWar(voterId, creatorId, { title: 'Open', castAt: '2026-01-01T00:00:00Z' }),
          await castVoteInNewWar(voterId, creatorId, { title: 'Secret', castAt: '2026-01-02T00:00:00Z', visibility: 'unlisted' }),
          await castVoteInNewWar(voterId, creatorId, { title: 'Gone', castAt: '2026-01-03T00:00:00Z', removed: true }),
        ];
      },
    );

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs that Voter\'s admin vote history', async () => {
      // Act
      response = await getAs(moderatorId, `/admin/voters/${voterId}/votes`);
    });

    Then('the response lists all 3 votes newest first, each with the War, winner and loser names and when it was cast', () => {
      // Assert
      expect(response.status).toBe(200);
      const items = response.body.votes as Item[];
      const newestFirst = [...votes].reverse();
      const newest = votes[2] as SeededVote;
      expect(items.map((item) => item.id)).toEqual(newestFirst.map((vote) => vote.voteId));
      expect(items[0]).toEqual({
        id: newest.voteId,
        war_id: newest.warId,
        war_title: 'Gone',
        matchup_id: newest.matchupId,
        winner_contestant_id: newest.winnerId,
        winner_name: 'Gone Winner',
        loser_contestant_id: newest.loserId,
        loser_name: 'Gone Loser',
        cast_at: '2026-01-03T00:00:00.000Z',
      });
      expect(items.map((item) => item.war_title)).toEqual(['Gone', 'Secret', 'Open']);
      expect(items.map((item) => item.loser_name)).toEqual(['Gone Loser', 'Secret Loser', 'Open Loser']);
      expect(response.body.next_cursor).toBeNull();
    });
  });

  Scenario('A Voter\'s admin vote history is returned a page at a time', ({ Given, And, When, Then }) => {
    let voterId: string;
    let castIds: string[];
    let moderatorId: string;
    let pages: request.Response[];

    Given('a Voter who cast 5 votes within the same millisecond', async () => {
      // Arrange
      voterId = (await makeVoter(harness.db, 'alice')).id;
      const creatorId = (await makeVoter(harness.db, 'bob')).id;
      castIds = [];
      for (let i = 1; i <= 5; i += 1) {
        const micros = String(i * 100).padStart(6, '0');
        const vote = await castVoteInNewWar(voterId, creatorId, { title: `War ${i}`, castAt: `2026-01-01T00:00:00.${micros}Z` });
        castIds.unshift(vote.voteId);
      }
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator pages through that Voter\'s admin vote history with limit 2 following each next cursor', async () => {
      // Act
      pages = await pageThrough(moderatorId, `/admin/voters/${voterId}/votes`, '2');
    });

    Then('there are 3 pages, every vote appears exactly once newest first, and the last cursor is null', () => {
      // Assert
      expect(pages.map((page) => (page.body.votes as Item[]).length)).toEqual([2, 2, 1]);
      expect(pages.flatMap((page) => (page.body.votes as Item[]).map((vote) => vote.id))).toEqual(castIds);
      expect(pages[0]?.body.next_cursor).toEqual(expect.any(String));
      expect(pages[2]?.body.next_cursor).toBeNull();
    });
  });

  Scenario('A malformed cursor on the admin Voters is rejected', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Voters with cursor "not-a-cursor"', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/voters', { cursor: 'not-a-cursor' });
    });

    Then('the response is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  Scenario('A malformed cursor on a Voter\'s admin vote history is rejected', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs their own admin vote history with cursor "not-a-cursor"', async () => {
      // Act
      response = await getAs(moderatorId, `/admin/voters/${moderatorId}/votes`, { cursor: 'not-a-cursor' });
    });

    Then('the response is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  ScenarioOutline('A limit outside 1 to 100 on an admin list is rejected', ({ Given, When, Then }, variables) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs <path> with limit 101', async () => {
      // Act
      response = await getAs(moderatorId, variables.path as string, { limit: '101' });
    });

    Then('the response is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  Scenario('The public War route still hides a removed War from a Moderator', ({ Given, And, When, Then }) => {
    let warId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a removed War', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'alice')).id;
      warId = (await makeDraftWar(harness.db, creatorId, { title: 'Gone' })).id;
      await setWarColumns(warId, { status: 'published', removed: true });
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs that War from the public endpoint', async () => {
      // Act
      response = await getAs(moderatorId, `/wars/${warId}`);
    });

    Then('the response is 404', () => {
      // Assert
      expect(response.status).toBe(404);
    });
  });

  Scenario('Reading the admin endpoints writes nothing to the moderation log', ({ Given, And, When, Then }) => {
    let voterId: string;
    let warId: string;
    let moderatorId: string;

    Given('a Voter with a War and a vote', async () => {
      // Arrange
      voterId = (await makeVoter(harness.db, 'alice')).id;
      warId = (await castVoteInNewWar(voterId, voterId, { title: 'Mine', castAt: '2026-01-01T00:00:00Z' })).warId;
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs all 5 admin endpoints', async () => {
      // Act
      for (const path of ['/admin/wars', `/admin/wars/${warId}`, '/admin/voters', `/admin/voters/${voterId}`, `/admin/voters/${voterId}/votes`]) {
        expect((await getAs(moderatorId, path)).status).toBe(200);
      }
    });

    Then('the moderation log is empty', async () => {
      // Assert
      expect(await moderationLog(harness.db)).toHaveLength(0);
    });
  });

  Scenario('The admin Wars report and filter by effective status before the close task runs', ({ Given, And, When, Then }) => {
    let warId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter who created a published War whose end date passed a minute ago and has not yet been closed by the close task', async () => {
      // Arrange
      ({ warId } = await seedExpiredUnclosedWar());
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the admin Wars with status closed', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { status: 'closed' });
    });

    Then('the response lists that War with status "closed"', () => {
      // Assert
      expect(response.status).toBe(200);
      const wars = response.body.wars as Item[];
      expect(wars.map((war) => [war.id, war.status])).toEqual([[warId, 'closed']]);
    });

    When('the Moderator GETs the admin Wars with status published', async () => {
      // Act
      response = await getAs(moderatorId, '/admin/wars', { status: 'published' });
    });

    Then('the response does not list that War', () => {
      // Assert
      expect(response.status).toBe(200);
      expect((response.body.wars as Item[]).map((war) => war.id)).not.toContain(warId);
    });
  });

  Scenario('The admin War detail reports effective status before the close task runs', ({ Given, And, When, Then }) => {
    let warId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter who created a published War whose end date passed a minute ago and has not yet been closed by the close task', async () => {
      // Arrange
      ({ warId } = await seedExpiredUnclosedWar());
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs that War from the admin endpoint', async () => {
      // Act
      response = await getAs(moderatorId, `/admin/wars/${warId}`);
    });

    Then('the response shows that War with status "closed"', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: warId, status: 'closed' });
    });
  });

  Scenario("The admin Voter detail reports each War's effective status before the close task runs", ({ Given, And, When, Then }) => {
    let creatorId: string;
    let warId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('a Voter who created a published War whose end date passed a minute ago and has not yet been closed by the close task', async () => {
      // Arrange
      ({ creatorId, warId } = await seedExpiredUnclosedWar());
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs that Voter from the admin endpoint', async () => {
      // Act
      response = await getAs(moderatorId, `/admin/voters/${creatorId}`);
    });

    Then('the response lists that War with status "closed"', () => {
      // Assert
      expect(response.status).toBe(200);
      const wars = response.body.wars as Item[];
      expect(wars.map((war) => [war.id, war.status])).toEqual([[warId, 'closed']]);
    });
  });
});
