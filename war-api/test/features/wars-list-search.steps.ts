import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWarWithContestants, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/wars-list-search.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  async function getWars(query: string): Promise<request.Response> {
    return request(harness.app.server).get(`/api/v1/wars${query}`);
  }

  type SummaryWar = { id: string; title: string | null; creator_name: string | null };

  function warsOf(response: request.Response): SummaryWar[] {
    return response.body.wars as SummaryWar[];
  }

  /** Publishes a War with the given title (or `null` for untitled), created by a voter with the given display name. */
  async function publishWarByCreator(title: string | null, creatorDisplayName: string): Promise<{ id: string; title: string | null }> {
    const creator = await makeVoter(harness.db, creatorDisplayName);
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { title });
    const published = await publishWarForTest(harness.db, war);
    return { id: published.id, title: published.title };
  }

  Scenario("q matches a War's title, case-insensitively, anywhere in the title", ({ Given, When, Then }) => {
    let pastryWarId: string;
    let response: request.Response;

    Given('a published War titled "Great Pastry Showdown" and a published War titled "Something Else Entirely"', async () => {
      pastryWarId = (await publishWarByCreator('Great Pastry Showdown', 'creator-a')).id;
      await publishWarByCreator('Something Else Entirely', 'creator-b');
    });

    When('anyone GETs /api/v1/wars?q=PASTRY', async () => {
      response = await getWars('?q=PASTRY');
    });

    Then('only the pastry War is returned', () => {
      expect(response.status).toBe(200);
      expect(warsOf(response).map((war) => war.id)).toEqual([pastryWarId]);
    });
  });

  Scenario("q matches a War's creator's display name, case-insensitively, anywhere in the name", ({ Given, And, When, Then }) => {
    let alexandriaWarId: string;
    let response: request.Response;

    Given('a voter named "Alexandria Rivera" has created a published War titled "Unrelated Title"', async () => {
      alexandriaWarId = (await publishWarByCreator('Unrelated Title', 'Alexandria Rivera')).id;
    });

    And('a voter named "Someone Else" has created a published War titled "Another Unrelated Title"', async () => {
      await publishWarByCreator('Another Unrelated Title', 'Someone Else');
    });

    When('anyone GETs /api/v1/wars?q=rivera', async () => {
      response = await getWars('?q=rivera');
    });

    Then("only Alexandria's War is returned", () => {
      expect(response.status).toBe(200);
      expect(warsOf(response).map((war) => war.id)).toEqual([alexandriaWarId]);
    });
  });

  Scenario('creator_name is present on every returned War summary', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('a voter named "Creator Name" has created a published War', async () => {
      await publishWarByCreator('Some Title', 'Creator Name');
    });

    When('anyone GETs /api/v1/wars', async () => {
      response = await getWars('');
    });

    Then("that War's creator_name is \"Creator Name\"", () => {
      expect(response.status).toBe(200);
      expect(warsOf(response)).toHaveLength(1);
      expect(warsOf(response)[0]?.creator_name).toBe('Creator Name');
    });
  });

  Scenario("A War with no title still matches search by its creator's display name", ({ Given, And, When, Then }) => {
    let untitledWarId: string;
    let response: request.Response;

    Given('a published War with no title, created by a voter named "Searchable Creator"', async () => {
      untitledWarId = (await publishWarByCreator(null, 'Searchable Creator')).id;
    });

    And('a published War titled "Other Title" created by a voter named "Other Voter"', async () => {
      await publishWarByCreator('Other Title', 'Other Voter');
    });

    When('anyone GETs /api/v1/wars?q=searchable', async () => {
      response = await getWars('?q=searchable');
    });

    Then('only the untitled War is returned', () => {
      expect(response.status).toBe(200);
      expect(warsOf(response).map((war) => war.id)).toEqual([untitledWarId]);
    });
  });

  Scenario('A whitespace-only title never matches search, even for that literal whitespace', ({ Given, And, When, Then }) => {
    let response: request.Response;

    Given('a published War titled "   " created by a voter named "Nobody Special"', async () => {
      await publishWarByCreator('   ', 'Nobody Special');
    });

    And('a published War titled "Space Explorers" created by a voter named "Someone Else"', async () => {
      await publishWarByCreator('Space Explorers', 'Someone Else');
    });

    When('anyone GETs /api/v1/wars?q=%20%20%20', async () => {
      response = await getWars('?q=%20%20%20');
    });

    Then('neither War is returned', () => {
      expect(response.status).toBe(200);
      expect(warsOf(response)).toEqual([]);
    });
  });

  Scenario('A literal percent sign in the search text is not treated as a wildcard', ({ Given, When, Then }) => {
    let percentWarId: string;
    let response: request.Response;

    Given('a published War titled "100% Off" and a published War titled "Full Price"', async () => {
      percentWarId = (await publishWarByCreator('100% Off', 'creator-a')).id;
      await publishWarByCreator('Full Price', 'creator-b');
    });

    When('anyone GETs /api/v1/wars?q=%25', async () => {
      response = await getWars('?q=%25');
    });

    Then('only the "100% Off" War is returned', () => {
      expect(response.status).toBe(200);
      expect(warsOf(response).map((war) => war.id)).toEqual([percentWarId]);
    });
  });

  Scenario('A literal underscore in the search text is not treated as a single-character wildcard', ({ Given, When, Then }) => {
    let underscoreWarId: string;
    let response: request.Response;

    Given('a published War titled "A_B" and a published War titled "AXB"', async () => {
      underscoreWarId = (await publishWarByCreator('A_B', 'creator-a')).id;
      await publishWarByCreator('AXB', 'creator-b');
    });

    When('anyone GETs /api/v1/wars?q=A_B', async () => {
      response = await getWars('?q=A_B');
    });

    Then('only the "A_B" War is returned', () => {
      expect(response.status).toBe(200);
      expect(warsOf(response).map((war) => war.id)).toEqual([underscoreWarId]);
    });
  });
});
