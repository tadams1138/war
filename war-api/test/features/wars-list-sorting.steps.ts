import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { sql } from 'kysely';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { getWars } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/wars-list-sorting.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

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

  ScenarioOutline('Creation-time sorts order Wars by when they were created', ({ Given, When, Then, And }, variables) => {
    let response: request.Response;

    Given('published Wars were created in order: "First War", "Second War", "Third War"', async () => {
      // Arrange
      await publishWarWithOptions('creator-first', { title: 'First War' });
      await publishWarWithOptions('creator-second', { title: 'Second War' });
      await publishWarWithOptions('creator-third', { title: 'Third War' });
    });

    When('anyone GETs /api/v1/wars<query>', async () => {
      // Act
      response = await getWars(harness, variables.query as string);
    });

    Then('the Wars are returned in the order <order>', () => {
      // Assert
      const expectedTitles = (variables.order as string).split(', ').map((quoted) => quoted.replaceAll('"', ''));
      expect(response.status).toBe(200);
      expect(titlesOf(response)).toEqual(expectedTitles);
    });

    And('next_cursor is null', () => {
      // Assert
      expect(response.body.next_cursor).toBeNull();
    });
  });

  Scenario('Alphabetical sort orders titled Wars before an untitled War, sorted by title', ({ Given, When, Then }) => {
    let response: request.Response;

    Given(
      'published Wars, created out of title order: an untitled War, then "Zebra Pageant", then "Apple Pageant"',
      async () => {
      // Arrange
        await publishWarWithOptions('creator-untitled', { title: null });
        await publishWarWithOptions('creator-zebra', { title: 'Zebra Pageant' });
        await publishWarWithOptions('creator-apple', { title: 'Apple Pageant' });
      },
    );

    When('anyone GETs /api/v1/wars?sort=alphabetical', async () => {
      // Act
      response = await getWars(harness, '?sort=alphabetical');
    });

    Then('the Wars are returned in the order "Apple Pageant", "Zebra Pageant", then the untitled War', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(titlesOf(response)).toEqual(['Apple Pageant', 'Zebra Pageant', null]);
    });
  });

  Scenario('Expiring soonest sort orders Wars by end date, with never-ending Wars last', ({ Given, When, Then }) => {
    let response: request.Response;

    Given(
      'published Wars, created out of end-date order: one with no end date, then one ending "2027-03-01T00:00:00Z", then one ending "2027-02-01T00:00:00Z"',
      async () => {
      // Arrange
        await publishWarWithOptions('creator-none', { title: 'No End War', endsAt: null });
        await publishWarWithOptions('creator-march', { title: 'March War', endsAt: new Date('2027-03-01T00:00:00Z') });
        await publishWarWithOptions('creator-feb', { title: 'Feb War', endsAt: new Date('2027-02-01T00:00:00Z') });
      },
    );

    When('anyone GETs /api/v1/wars?sort=expiring_soonest', async () => {
      // Act
      response = await getWars(harness, '?sort=expiring_soonest');
    });

    Then(
      'the Wars are returned in the order the War ending "2027-02-01T00:00:00Z", the War ending "2027-03-01T00:00:00Z", then the never-ending War',
      () => {
      // Assert
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
        // Arrange
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
        // Act
        let cursor: string | null = null;
        const collected: { id: string; title: string | null }[] = [];
        for (let i = 0; i < 10; i += 1) {
          const query = cursor
            ? `?sort=alphabetical&limit=2&cursor=${encodeURIComponent(cursor)}`
            : '?sort=alphabetical&limit=2';
          const page = await getWars(harness, query);
          expect(page.status).toBe(200);
          collected.push(...(page.body.wars as { id: string; title: string | null }[]));
          cursor = page.body.next_cursor;
          if (!cursor) break;
        }
        collectedIds = collected.map((war) => war.id);
        collectedTitles = collected.map((war) => war.title);
      });

      Then('every one of the six Wars is returned exactly once, across all pages', () => {
        // Assert
        expect(collectedIds).toHaveLength(6);
        expect(new Set(collectedIds)).toEqual(expectedIds);
      });

      And('every titled War appears before every untitled War, in the order collected', () => {
        // Assert
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
      // Arrange
      await publishWarWithOptions('creator-1', { title: 'Some War' });
    });

    When('anyone GETs /api/v1/wars?cursor=not-a-real-cursor', async () => {
      // Act
      response = await getWars(harness, '?cursor=not-a-real-cursor');
    });

    Then('the response status is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });

    And('the response body is exactly {"error": "invalid cursor"}', () => {
      // Assert
      expect(response.body).toEqual({ error: 'invalid cursor' });
    });
  });

  Scenario('A cursor produced under one sort mode is rejected when replayed under another', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('two published Wars', async () => {
      // Arrange
      await publishWarWithOptions('creator-1', { title: 'War One' });
      await publishWarWithOptions('creator-2', { title: 'War Two' });
    });

    When(
      'anyone GETs a first page of /api/v1/wars?sort=newest&limit=1, then reuses its next_cursor against /api/v1/wars?sort=oldest&limit=1',
      async () => {
      // Act
        const first = await getWars(harness, '?sort=newest&limit=1');
        const cursor = first.body.next_cursor as string;
        response = await getWars(harness, `?sort=oldest&limit=1&cursor=${encodeURIComponent(cursor)}`);
      },
    );

    Then('the response status is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  /** Publishes three Wars and pins their creation times 100 microseconds apart, inside one millisecond. Returns ids oldest-first. */
  async function publishThreeWarsWithinOneMillisecond(): Promise<string[]> {
    const wars = [
      await publishWarWithOptions('creator-us-1', { title: 'Micro One' }),
      await publishWarWithOptions('creator-us-2', { title: 'Micro Two' }),
      await publishWarWithOptions('creator-us-3', { title: 'Micro Three' }),
    ];
    for (const [i, war] of wars.entries()) {
      const microseconds = 100 * (i + 1);
      await sql`update wars set created_at = '2026-01-01T00:00:00Z'::timestamptz + ${microseconds} * interval '1 microsecond' where id = ${war.id}::uuid`.execute(harness.db);
    }
    return wars.map((war) => war.id);
  }

  async function collectIdsByPaging(baseQuery: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const page: request.Response = await getWars(harness, cursor ? `${baseQuery}&cursor=${encodeURIComponent(cursor)}` : baseQuery);
      expect(page.status).toBe(200);
      ids.push(...(page.body.wars as { id: string }[]).map((war) => war.id));
      cursor = page.body.next_cursor;
      if (!cursor) break;
    }
    return ids;
  }

  Scenario('Paging newest first neither skips nor repeats Wars created within the same millisecond', ({ Given, When, Then }) => {
    let idsOldestFirst: string[];
    let paged: string[];

    Given('three published Wars whose creation times differ by less than a millisecond', async () => {
      // Arrange
      idsOldestFirst = await publishThreeWarsWithinOneMillisecond();
    });

    When('anyone pages through /api/v1/wars?limit=1 by following next_cursor until it is null', async () => {
      // Act
      paged = await collectIdsByPaging('?limit=1');
    });

    Then('the three Wars are returned exactly once each, newest first', () => {
      // Assert
      expect(paged).toEqual([...idsOldestFirst].reverse());
    });
  });

  Scenario('Paging oldest first neither skips nor repeats Wars created within the same millisecond', ({ Given, When, Then }) => {
    let idsOldestFirst: string[];
    let paged: string[];

    Given('three published Wars whose creation times differ by less than a millisecond', async () => {
      // Arrange
      idsOldestFirst = await publishThreeWarsWithinOneMillisecond();
    });

    When('anyone pages through /api/v1/wars?sort=oldest&limit=1 by following next_cursor until it is null', async () => {
      // Act
      paged = await collectIdsByPaging('?sort=oldest&limit=1');
    });

    Then('the three Wars are returned exactly once each, oldest first', () => {
      // Assert
      expect(paged).toEqual(idsOldestFirst);
    });
  });

  Scenario('A last page that exactly fills the limit has no next_cursor', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('two published Wars', async () => {
      // Arrange
      await publishWarWithOptions('creator-1', { title: 'War One' });
      await publishWarWithOptions('creator-2', { title: 'War Two' });
    });

    When('anyone GETs /api/v1/wars?limit=2', async () => {
      // Act
      response = await getWars(harness, '?limit=2');
    });

    Then('next_cursor is null', () => {
      // Assert
      expect(response.body.wars).toHaveLength(2);
      expect(response.body.next_cursor).toBeNull();
    });
  });

  Scenario('A page size outside 1 to 100 is rejected', ({ Given, When, Then }) => {
    let statuses: number[];

    Given('a published War', async () => {
      // Arrange
      await publishWarWithOptions('creator-1', { title: 'Some War' });
    });

    When('anyone GETs /api/v1/wars with a limit of 0, -5, 101, 1.5 and "many"', async () => {
      // Act
      statuses = [];
      for (const limit of ['0', '-5', '101', '1.5', 'many']) {
        statuses.push((await getWars(harness, `?limit=${limit}`)).status);
      }
    });

    Then('every response status is 400', () => {
      // Assert
      expect(statuses).toEqual([400, 400, 400, 400, 400]);
    });
  });
});
