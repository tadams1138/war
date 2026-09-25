import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWarWithContestants, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/wars-list-sorting.feature', import.meta.url)));

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

  function titlesOf(response: request.Response): (string | null)[] {
    return (response.body.wars as { title: string | null }[]).map((war) => war.title);
  }

  /** Publishes a War with the given title (or `null` for untitled) and, optionally, an end date. Each gets its own voter so creation order is the only thing distinguishing them. */
  async function publishWarWithOptions(
    creatorSeed: string,
    options: { title: string | null; endsAt?: Date | null },
  ): Promise<{ id: string; title: string | null }> {
    const creator = await makeVoter(harness.db, creatorSeed);
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
      title: options.title,
      endsAt: options.endsAt ?? null,
    });
    const published = await publishWarForTest(harness.db, war);
    return { id: published.id, title: published.title };
  }

  Scenario('Newest sort (the default) orders Wars by creation time, most recent first', ({ Given, When, Then, And }) => {
    let response: request.Response;

    Given('published Wars were created in order: "First War", "Second War", "Third War"', async () => {
      await publishWarWithOptions('creator-first', { title: 'First War' });
      await publishWarWithOptions('creator-second', { title: 'Second War' });
      await publishWarWithOptions('creator-third', { title: 'Third War' });
    });

    When('anyone GETs /api/v1/wars', async () => {
      response = await getWars('');
    });

    Then('the Wars are returned in the order "Third War", "Second War", "First War"', () => {
      expect(response.status).toBe(200);
      expect(titlesOf(response)).toEqual(['Third War', 'Second War', 'First War']);
    });

    And('next_cursor is null', () => {
      expect(response.body.next_cursor).toBeNull();
    });
  });

  Scenario('Oldest sort orders Wars by creation time, earliest first', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('published Wars were created in order: "First War", "Second War", "Third War"', async () => {
      await publishWarWithOptions('creator-first', { title: 'First War' });
      await publishWarWithOptions('creator-second', { title: 'Second War' });
      await publishWarWithOptions('creator-third', { title: 'Third War' });
    });

    When('anyone GETs /api/v1/wars?sort=oldest', async () => {
      response = await getWars('?sort=oldest');
    });

    Then('the Wars are returned in the order "First War", "Second War", "Third War"', () => {
      expect(response.status).toBe(200);
      expect(titlesOf(response)).toEqual(['First War', 'Second War', 'Third War']);
    });
  });

  Scenario('Alphabetical sort orders titled Wars before an untitled War, sorted by title', ({ Given, When, Then }) => {
    let response: request.Response;

    Given(
      'published Wars, created out of title order: an untitled War, then "Zebra Pageant", then "Apple Pageant"',
      async () => {
        await publishWarWithOptions('creator-untitled', { title: null });
        await publishWarWithOptions('creator-zebra', { title: 'Zebra Pageant' });
        await publishWarWithOptions('creator-apple', { title: 'Apple Pageant' });
      },
    );

    When('anyone GETs /api/v1/wars?sort=alphabetical', async () => {
      response = await getWars('?sort=alphabetical');
    });

    Then('the Wars are returned in the order "Apple Pageant", "Zebra Pageant", then the untitled War', () => {
      expect(response.status).toBe(200);
      expect(titlesOf(response)).toEqual(['Apple Pageant', 'Zebra Pageant', null]);
    });
  });

  Scenario('Expiring soonest sort orders Wars by end date, with never-ending Wars last', ({ Given, When, Then }) => {
    let response: request.Response;

    Given(
      'published Wars, created out of end-date order: one with no end date, then one ending "2027-03-01T00:00:00Z", then one ending "2027-02-01T00:00:00Z"',
      async () => {
        await publishWarWithOptions('creator-none', { title: 'No End War', endsAt: null });
        await publishWarWithOptions('creator-march', { title: 'March War', endsAt: new Date('2027-03-01T00:00:00Z') });
        await publishWarWithOptions('creator-feb', { title: 'Feb War', endsAt: new Date('2027-02-01T00:00:00Z') });
      },
    );

    When('anyone GETs /api/v1/wars?sort=expiring_soonest', async () => {
      response = await getWars('?sort=expiring_soonest');
    });

    Then(
      'the Wars are returned in the order the War ending "2027-02-01T00:00:00Z", the War ending "2027-03-01T00:00:00Z", then the never-ending War',
      () => {
        expect(response.status).toBe(200);
        expect(titlesOf(response)).toEqual(['Feb War', 'March War', 'No End War']);
      },
    );
  });

  Scenario(
    'Pagination continues correctly across the null/non-null boundary under alphabetical sort',
    ({ Given, When, Then, And }) => {
      let expectedIds: Set<string>;
      let collectedIds: string[] = [];
      let collectedTitles: (string | null)[] = [];

      Given('six published Wars: titled "Alpha War", "Beta War", and "Gamma War", and three more with no title', async () => {
        const titled = await Promise.all([
          publishWarWithOptions('creator-alpha', { title: 'Alpha War' }),
          publishWarWithOptions('creator-beta', { title: 'Beta War' }),
          publishWarWithOptions('creator-gamma', { title: 'Gamma War' }),
        ]);
        const untitled = await Promise.all([
          publishWarWithOptions('creator-u1', { title: null }),
          publishWarWithOptions('creator-u2', { title: null }),
          publishWarWithOptions('creator-u3', { title: null }),
        ]);
        expectedIds = new Set([...titled, ...untitled].map((war) => war.id));
      });

      When('anyone pages through /api/v1/wars?sort=alphabetical&limit=2 by following next_cursor until it is null', async () => {
        let cursor: string | null = null;
        const collected: { id: string; title: string | null }[] = [];
        for (let i = 0; i < 10; i += 1) {
          const query = cursor
            ? `?sort=alphabetical&limit=2&cursor=${encodeURIComponent(cursor)}`
            : '?sort=alphabetical&limit=2';
          const page = await getWars(query);
          expect(page.status).toBe(200);
          collected.push(...(page.body.wars as { id: string; title: string | null }[]));
          cursor = page.body.next_cursor;
          if (!cursor) break;
        }
        collectedIds = collected.map((war) => war.id);
        collectedTitles = collected.map((war) => war.title);
      });

      Then('every one of the six Wars is returned exactly once, across all pages', () => {
        expect(collectedIds).toHaveLength(6);
        expect(new Set(collectedIds)).toEqual(expectedIds);
      });

      And('every titled War appears before every untitled War, in the order collected', () => {
        const firstNullIndex = collectedTitles.indexOf(null);
        expect(firstNullIndex).toBeGreaterThan(-1);
        for (let i = 0; i < firstNullIndex; i += 1) {
          expect(collectedTitles[i]).not.toBeNull();
        }
        for (let i = firstNullIndex; i < collectedTitles.length; i += 1) {
          expect(collectedTitles[i]).toBeNull();
        }
      });
    },
  );

  Scenario('An invalid cursor is rejected', ({ Given, When, Then, And }) => {
    let response: request.Response;

    Given('a published War', async () => {
      await publishWarWithOptions('creator-1', { title: 'Some War' });
    });

    When('anyone GETs /api/v1/wars?cursor=not-a-real-cursor', async () => {
      response = await getWars('?cursor=not-a-real-cursor');
    });

    Then('the response status is 400', () => {
      expect(response.status).toBe(400);
    });

    And('the response body is exactly {"error": "invalid cursor"}', () => {
      expect(response.body).toEqual({ error: 'invalid cursor' });
    });
  });

  Scenario('A cursor produced under one sort mode is rejected when replayed under another', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('two published Wars', async () => {
      await publishWarWithOptions('creator-1', { title: 'War One' });
      await publishWarWithOptions('creator-2', { title: 'War Two' });
    });

    When(
      'anyone GETs a first page of /api/v1/wars?sort=newest&limit=1, then reuses its next_cursor against /api/v1/wars?sort=oldest&limit=1',
      async () => {
        const first = await getWars('?sort=newest&limit=1');
        const cursor = first.body.next_cursor as string;
        response = await getWars(`?sort=oldest&limit=1&cursor=${encodeURIComponent(cursor)}`);
      },
    );

    Then('the response status is 400', () => {
      expect(response.status).toBe(400);
    });
  });
});
