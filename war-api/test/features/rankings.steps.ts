import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { joinWarAsVoter, makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { anonymous, as, postVote } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/rankings.feature', import.meta.url)));

async function setCounts(harness: TestHarness, contestantId: string, winCount: number, appearanceCount: number) {
  await harness.db
    .updateTable('contestants')
    .set({ win_count: winCount, appearance_count: appearanceCount })
    .where('id', '=', contestantId)
    .execute();
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Anonymous user views public War rankings', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a public War in "published" status', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'public' });
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
    });

    When('an unauthenticated user GETs /wars/:id/rankings', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });
  });

  Scenario('Contestants are ranked by raw win count', ({ Given, When, Then }) => {
    let warId: string;
    let idA: string;
    let idB: string;
    let response: request.Response;

    Given('Contestant A has 320 wins and Contestant B has 300 wins', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
      [idA, idB] = contestants.map((c) => c.id) as [string, string];
      await setCounts(harness, idA, 320, 400);
      await setCounts(harness, idB, 300, 400);
    });

    When('rankings are fetched', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant A ranks above Contestant B', () => {
      // Assert
      const ranks: Record<string, number> = {};
      for (const entry of response.body.rankings) {
        ranks[entry.contestant.id] = entry.rank;
      }
      expect(ranks[idA]!).toBeLessThan(ranks[idB]!);
    });
  });

  Scenario('Ties are broken by fewer appearances', ({ Given, And, When, Then }) => {
    let warId: string;
    let idA: string;
    let idB: string;
    let response: request.Response;

    Given('Contestants A and B both have 50 wins', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
      [idA, idB] = contestants.map((c) => c.id) as [string, string];
    });

    And('Contestant A has 60 appearances and Contestant B has 80', async () => {
      // Arrange
      await setCounts(harness, idA, 50, 60);
      await setCounts(harness, idB, 50, 80);
    });

    When('rankings are fetched', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant A ranks above Contestant B', () => {
      // Assert
      const ranks: Record<string, number> = {};
      for (const entry of response.body.rankings) {
        ranks[entry.contestant.id] = entry.rank;
      }
      expect(ranks[idA]!).toBeLessThan(ranks[idB]!);
    });
  });

  Scenario('A high win rate on few showings does not top the board', ({ Given, And, When, Then }) => {
    let warId: string;
    let idA: string;
    let idB: string;
    let response: request.Response;

    Given('Contestant A has 3 wins from 3 appearances', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
      [idA, idB] = contestants.map((c) => c.id) as [string, string];
      await setCounts(harness, idA, 3, 3);
    });

    And('Contestant B has 320 wins from 400 appearances', async () => {
      // Arrange
      await setCounts(harness, idB, 320, 400);
    });

    When('rankings are fetched', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant B ranks above Contestant A', () => {
      // Assert
      const ranks: Record<string, number> = {};
      for (const entry of response.body.rankings) {
        ranks[entry.contestant.id] = entry.rank;
      }
      expect(ranks[idB]!).toBeLessThan(ranks[idA]!);
    });
  });

  Scenario('Contestants with no appearances are unranked', ({ Given, When, Then, And }) => {
    let warId: string;
    let idC: string;
    let response: request.Response;

    Given('Contestant C has an appearance_count of 0', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
      idC = contestants[1]!.id;
      await setCounts(harness, contestants[0]!.id, 5, 10);
    });

    When('rankings are fetched', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('Contestant C appears at the bottom', () => {
      // Assert
      const lastEntry = response.body.rankings.at(-1);
      expect(lastEntry.contestant.id).toBe(idC);
    });

    And('its rank is null', () => {
      // Assert
      const entry = response.body.rankings.find((r: { contestant: { id: string } }) => r.contestant.id === idC);
      expect(entry.rank).toBeNull();
    });
  });

  Scenario('Exposure stays balanced as a War progresses', ({ Given, When, Then }) => {
    let warId: string;
    let voterId: string;

    Given('a published War that has received several hundred votes', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 5);
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;

      // 5 contestants → 10 pairs; simulate many voters so appearance_counts
      // accumulate while pair selection keeps them balanced.
      for (let i = 0; i < 30; i += 1) {
        const voter = await makeVoter(harness.db, `voter-${i}`);
        await joinWarAsVoter(harness.db, warId, voter.id);
        voterId = voter.id;
        for (;;) {
          const next = await as(harness, voter.id).get(`/api/v1/wars/${warId}/matchups/next`);
          if (next.status === 204) break;
          await postVote(harness, warId, next.body.matchup.id, voter.id, next.body.matchup.left.id);
        }
      }
    });

    When("contestants' appearance_counts are compared", async () => {
      // Act
      // Assertion performed in Then; this step exists for readability only.
      expect(voterId).toBeTruthy();
    });

    Then('they are clustered within a narrow range', async () => {
      // Assert
      const rows = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', warId).execute();
      const counts = rows.map((r) => r.appearance_count);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });
  });

  Scenario('Rankings are cacheable for public Wars', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a public War', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const war = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'public' });
      const published = await publishWarForTest(harness.db, war.war);
      warId = published.id;
    });

    When('rankings are fetched', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response sets Cache-Control public with max-age 30', () => {
      // Assert
      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });
  });

  async function givenPublishedUnlistedWar(): Promise<string> {
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { visibility: 'unlisted' });
    const published = await publishWarForTest(harness.db, war);
    return published.id;
  }

  Scenario("Anonymous user views an unlisted War's rankings", ({ Given, When, Then, And }) => {
    let warId: string;
    let response: request.Response;

    Given('an unlisted War in "published" status', async () => {
      // Arrange
      warId = await givenPublishedUnlistedWar();
    });

    When('an unauthenticated user GETs rankings', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the response sets Cache-Control public with max-age 30', () => {
      // Assert
      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });
  });

  Scenario("A signed-in non-member views an unlisted War's rankings", ({ Given, And, When, Then }) => {
    let warId: string;
    let voterId: string;
    let response: request.Response;

    Given('an unlisted War in "published" status', async () => {
      // Arrange
      warId = await givenPublishedUnlistedWar();
    });

    And('a signed-in voter who has not joined it', async () => {
      // Arrange
      const voter = await makeVoter(harness.db, 'outsider');
      voterId = voter.id;
    });

    When('that voter GETs rankings', async () => {
      // Act
      response = await as(harness, voterId).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the response sets Cache-Control public with max-age 30', () => {
      // Assert
      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });
  });

  Scenario("Rankings report the War's own theme", ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a public War with theme "fight_card"', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
        visibility: 'public',
        theme: 'fight_card',
      });
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
    });

    When('rankings are fetched', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response reports theme "fight_card"', () => {
      // Assert
      expect(response.body.theme).toBe('fight_card');
    });
  });
});
