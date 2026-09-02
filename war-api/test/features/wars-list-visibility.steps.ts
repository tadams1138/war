import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWar, makeDraftWarWithContestants, activateWarForTest, closeWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/wars-list-visibility.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  async function getWars(query = '', voterId?: string): Promise<request.Response> {
    const req = request(harness.app.server).get(`/api/v1/wars${query}`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req;
  }

  function idsOf(response: request.Response): string[] {
    return (response.body.wars as { id: string }[]).map((war) => war.id);
  }

  Scenario(
    'Anonymous listing excludes drafts, invite-only Wars, and non-active Wars by default',
    ({ Given, When, Then }) => {
      let activeWarId: string;
      let response: request.Response;

      Given(
        'a voter has created a public active War, a public draft War, a public closed War, and an active invite-only War',
        async () => {
          const creator = await makeVoter(harness.db, 'creator');

          const { war: activeWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Public Active War',
          });
          const active = await activateWarForTest(harness.db, activeWar);
          activeWarId = active.id;

          await makeDraftWar(harness.db, creator.id, { title: 'Public Draft War' });

          const { war: closedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Public Closed War',
          });
          const activatedClosed = await activateWarForTest(harness.db, closedWar);
          await closeWarForTest(harness.db, activatedClosed);

          const { war: inviteOnlyWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Active Invite Only War',
            visibility: 'invite_only',
          });
          await activateWarForTest(harness.db, inviteOnlyWar);
        },
      );

      When('anyone GETs /api/v1/wars', async () => {
        response = await getWars();
      });

      Then('only the public active War is returned', () => {
        expect(response.status).toBe(200);
        expect(idsOf(response)).toEqual([activeWarId]);
      });
    },
  );

  Scenario('Being authenticated grants no extra visibility on its own', ({ Given, When, Then }) => {
    let draftWarId: string;
    let otherVoterId: string;
    let response: request.Response;

    Given('a voter has created a public draft War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const draft = await makeDraftWar(harness.db, creator.id, { title: 'Someone Else’s Draft' });
      draftWarId = draft.id;

      const other = await makeVoter(harness.db, 'other');
      otherVoterId = other.id;
    });

    When('a different, authenticated voter GETs /api/v1/wars', async () => {
      response = await getWars('', otherVoterId);
    });

    Then('that draft War is not returned', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(draftWarId);
    });
  });

  Scenario('An explicit status filter does not override visibility scoping', ({ Given, When, Then }) => {
    let closedInviteOnlyWarId: string;
    let response: request.Response;

    Given('a voter has created a closed, invite-only War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
        title: 'Closed Invite Only War',
        visibility: 'invite_only',
      });
      const active = await activateWarForTest(harness.db, war);
      const closed = await closeWarForTest(harness.db, active);
      closedInviteOnlyWarId = closed.id;
    });

    When('anyone GETs /api/v1/wars?status=closed', async () => {
      response = await getWars('?status=closed');
    });

    Then('that War is not returned', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(closedInviteOnlyWarId);
    });
  });
});
