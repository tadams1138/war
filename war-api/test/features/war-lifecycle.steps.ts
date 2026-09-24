import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { findWarById } from '../../src/wars/warsRepository.js';
import { countMatchupsForWar } from '../../src/matchups/matchupsRepository.js';
import {
  makeVoter,
  makeDraftWar,
  makeContestant,
  giveContestantAnImage,
  makeDraftWarWithContestants,
  publishWarForTest,
  closeWarForTest,
  joinWarAsVoter,
} from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/war-lifecycle.feature', import.meta.url)));

/** Casts one vote on `matchupId` as a fresh voter who joins first, naming `winnerId` as the winner. */
async function castVoteAsNewVoter(
  harness: TestHarness,
  warId: string,
  matchupId: string,
  winnerId: string,
  seed: string,
): Promise<void> {
  const voter = await makeVoter(harness.db, seed);
  await joinWarAsVoter(harness.db, warId, voter.id);
  await harness.app.ready();
  const jwt = await harness.jwtFor(voter.id);
  await request(harness.app.server)
    .post(`/api/v1/wars/${warId}/matchups/${matchupId}/vote`)
    .set('Authorization', `Bearer ${jwt}`)
    .send({ winner_id: winnerId });
}

/** Every matchup row for a War, in no particular order. */
async function matchupsForWar(harness: TestHarness, warId: string) {
  return harness.db.selectFrom('matchups').selectAll().where('war_id', '=', warId).execute();
}

/** Casts one vote on every one of a War's matchups, each by a distinct fresh voter, naming contestant A as the winner each time. */
async function castVoteOnEveryMatchup(harness: TestHarness, warId: string): Promise<void> {
  const matchups = await matchupsForWar(harness, warId);
  let seed = 0;
  for (const matchup of matchups) {
    seed += 1;
    await castVoteAsNewVoter(harness, warId, matchup.id, matchup.contestant_a_id, `voter-${seed}`);
  }
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Creator publishes a War with enough contestants', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" status with 3 contestants, each with an image', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      warId = war.id;
    });

    When('the creator POSTs to /api/v1/wars/:id/publish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/publish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the War status becomes "published"', () => {
      expect(response.status).toBe(200);
      expect((response.body as { status: string }).status).toBe('published');
    });
  });

  Scenario('Matchups are generated as contestants are added, not at publish time', ({ Given, And, When, Then }) => {
    let warId: string;
    let creatorId: string;

    Given('a War in "draft" status with 3 contestants', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      warId = war.id;
    });

    And('the War already has exactly 3 matchups', async () => {
      expect(await countMatchupsForWar(harness.db, warId)).toBe(3);
    });

    When('the creator POSTs to /api/v1/wars/:id/publish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${warId}/publish`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('the War still has exactly 3 matchups', async () => {
      expect(await countMatchupsForWar(harness.db, warId)).toBe(3);
    });
  });

  Scenario('Cannot publish with fewer than 2 contestants', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" with 1 contestant', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 1);
      warId = war.id;
    });

    When('the creator POSTs to publish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/publish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('the War remains "draft"', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('draft');
    });
  });

  Scenario('A contestant with no image can still publish', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" with 2 contestants, only one of which has an image', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId);
      warId = war.id;
      const withImage = await makeContestant(harness.db, warId, 'Has Image');
      await giveContestantAnImage(harness.db, harness.storage, withImage.id);
      await makeContestant(harness.db, warId, 'No Image');
    });

    When('the creator POSTs to publish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/publish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the War status becomes "published"', () => {
      expect(response.status).toBe(200);
      expect((response.body as { status: string }).status).toBe('published');
    });
  });

  Scenario('Non-creator cannot publish', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
      warId = war.id;
    });

    When('Voter B POSTs to publish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/publish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Unpublishing returns a published War to draft', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a published War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the creator POSTs to /api/v1/wars/:id/unpublish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/unpublish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the War status becomes "draft"', () => {
      expect(response.status).toBe(200);
      expect((response.body as { status: string }).status).toBe('draft');
    });
  });

  Scenario('Unpublishing touches no matchup, vote, or contestant', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;

    Given('a published War with 3 contestants', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the creator POSTs to /api/v1/wars/:id/unpublish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${warId}/unpublish`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('the War still has exactly 3 matchups', async () => {
      expect(await countMatchupsForWar(harness.db, warId)).toBe(3);
    });
  });

  Scenario('A War can be republished after being unpublished', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War that was published and then unpublished', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await publishWarForTest(harness.db, war);
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${war.id}/unpublish`).set('Authorization', `Bearer ${jwt}`).send();
      warId = war.id;
    });

    When('the creator POSTs to /api/v1/wars/:id/publish', async () => {
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/publish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the War status becomes "published"', () => {
      expect(response.status).toBe(200);
      expect((response.body as { status: string }).status).toBe('published');
    });
  });

  Scenario('A closed War cannot be published', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a closed War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      const published = await publishWarForTest(harness.db, war);
      await closeWarForTest(harness.db, published);
      warId = war.id;
    });

    When('the creator POSTs to publish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/publish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('the War remains "closed"', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('closed');
    });
  });

  Scenario('A closed War cannot be unpublished', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a closed War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      const published = await publishWarForTest(harness.db, war);
      await closeWarForTest(harness.db, published);
      warId = war.id;
    });

    When('the creator POSTs to /api/v1/wars/:id/unpublish', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/unpublish`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('the War remains "closed"', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('closed');
    });
  });

  Scenario('A War remains editable after publishing', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a published War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the creator PATCHes the title', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .patch(`/api/v1/wars/${warId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ title: 'New Title' });
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });
  });

  Scenario("A creator changes a War's theme while it's still a draft", ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" status', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId);
      warId = war.id;
    });

    When('the creator PATCHes the theme to "fight_card"', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .patch(`/api/v1/wars/${warId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ theme: 'fight_card' });
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('the War\'s theme is "fight_card"', () => {
      expect(response.body.theme).toBe('fight_card');
    });
  });

  Scenario('The contestant schema can only be changed while the War is a draft', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a published War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the creator PATCHes the contestant schema', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .patch(`/api/v1/wars/${warId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ contestant_schema: [{ key: 'country', label: 'Country', type: 'string' }] });
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });
  });

  Scenario('A voter joins a published War', ({ Given, And, When, Then }) => {
    let warId: string;
    let voterId: string;

    Given('a published War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    And('an authenticated voter who has not joined', async () => {
      const voter = await makeVoter(harness.db, 'joiner');
      voterId = voter.id;
    });

    When('they POST to /api/v1/wars/:id/join', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterId);
      await request(harness.app.server).post(`/api/v1/wars/${warId}/join`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('a war_membership record is created for that voter and War', async () => {
      const row = await harness.db
        .selectFrom('war_memberships')
        .selectAll()
        .where('war_id', '=', warId)
        .where('voter_id', '=', voterId)
        .executeTakeFirst();
      expect(row).toBeDefined();
    });
  });

  Scenario("The browse list reports each War's contestant count", ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a War with 3 contestants', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      // Published (not left in "draft"): an anonymous, unfiltered GET /wars
      // excludes draft Wars by default (war-spec.md §6.1), and this
      // scenario is about contestant_count, not visibility -- so the fixture
      // needs a War the anonymous request can actually see. contestant_count
      // must still reflect the contestants rows regardless of the War's
      // status.
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 3);
      const published = await publishWarForTest(harness.db, war);
      warId = published.id;
    });

    When('anyone GETs /api/v1/wars', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get('/api/v1/wars');
    });

    Then("that War's entry in the list has contestant_count 3", () => {
      const wars = response.body.wars as { id: string; contestant_count: number }[];
      const entry = wars.find((war) => war.id === warId);
      expect(entry).toBeDefined();
      expect(entry?.contestant_count).toBe(3);
    });
  });

  Scenario('War detail reports ownership to its creator', ({ Given, When, Then }) => {
    let warId: string;
    let voterAId: string;
    let response: request.Response;

    Given('a War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      voterAId = voterA.id;
      const war = await makeDraftWar(harness.db, voterAId);
      warId = war.id;
    });

    When("Voter A GETs the War's detail, authenticated", async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterAId);
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`);
    });

    Then('is_owner is true', () => {
      expect(response.body.is_owner).toBe(true);
    });
  });

  Scenario('War detail reports non-ownership to another voter', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a published War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When("Voter B GETs the War's detail, authenticated", async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`);
    });

    Then('is_owner is false', () => {
      expect(response.body.is_owner).toBe(false);
    });
  });

  Scenario('War detail reports non-ownership to an anonymous caller', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a published War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When("anyone GETs the War's detail, unauthenticated", async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}`);
    });

    Then('is_owner is false', () => {
      expect(response.body.is_owner).toBe(false);
    });
  });

  Scenario('A non-owner cannot see an unpublished War at all', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a War in "draft" status created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const war = await makeDraftWar(harness.db, voterA.id);
      warId = war.id;
    });

    When("Voter B GETs the War's detail, authenticated", async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`);
    });

    Then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });

  Scenario('The creator can always see their own War, in any status', ({ Given, When, Then }) => {
    let warId: string;
    let voterAId: string;
    let response: request.Response;

    Given('a War in "draft" status created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      voterAId = voterA.id;
      const war = await makeDraftWar(harness.db, voterAId);
      warId = war.id;
    });

    When("Voter A GETs the War's detail, authenticated", async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterAId);
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });
  });

  Scenario('Creator deletes a draft War', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" status created by Voter A', async () => {
      const creator = await makeVoter(harness.db, 'voter-a');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId);
      warId = war.id;
    });

    When('Voter A DELETEs the War', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server).delete(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('the response status is 204', () => {
      expect(response.status).toBe(204);
    });

    And('the War no longer exists', async () => {
      const war = await findWarById(harness.db, warId);
      expect(war).toBeUndefined();
    });
  });

  Scenario('Non-creator cannot delete a draft War', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const war = await makeDraftWar(harness.db, voterA.id);
      warId = war.id;
    });

    When('Voter B DELETEs the War', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server).delete(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Deleting a published War cascades its contestants, matchups, and votes', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let contestantIds: string[];
    let matchupIds: string[];
    let response: request.Response;

    Given('a published War with 2 contestants and a vote cast on their matchup', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
      contestantIds = contestants.map((c) => c.id);
      const matchups = await matchupsForWar(harness, warId);
      matchupIds = matchups.map((m) => m.id);
      await castVoteAsNewVoter(harness, warId, matchupIds[0]!, contestantIds[0]!, 'voter-1');
    });

    When('the creator DELETEs the War', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server).delete(`/api/v1/wars/${warId}`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('the response status is 204', () => {
      expect(response.status).toBe(204);
    });

    And('the War no longer exists', async () => {
      expect(await findWarById(harness.db, warId)).toBeUndefined();
    });

    And('its contestants no longer exist', async () => {
      const rows = await harness.db.selectFrom('contestants').selectAll().where('id', 'in', contestantIds).execute();
      expect(rows).toHaveLength(0);
    });

    And('its matchups no longer exist', async () => {
      const rows = await harness.db.selectFrom('matchups').selectAll().where('id', 'in', matchupIds).execute();
      expect(rows).toHaveLength(0);
    });

    And('its votes no longer exist', async () => {
      const rows = await harness.db.selectFrom('votes').selectAll().where('matchup_id', 'in', matchupIds).execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('Adding a contestant generates matchups against the existing roster', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;

    Given('a published War with 2 contestants', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the creator adds a third contestant', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Contestant 3' });
    });

    Then('the War has exactly 3 matchups', async () => {
      expect(await countMatchupsForWar(harness.db, warId)).toBe(3);
    });
  });

  Scenario('Removing a contestant with no votes just removes it', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let removedId: string;

    Given('a War with 3 contestants and no votes cast', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      warId = war.id;
      removedId = contestants[0]!.id;
    });

    When('the creator removes one of the contestants', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server)
        .delete(`/api/v1/wars/${warId}/contestants/${removedId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('that contestant no longer exists', async () => {
      const row = await harness.db.selectFrom('contestants').selectAll().where('id', '=', removedId).executeTakeFirst();
      expect(row).toBeUndefined();
    });

    And('the War has exactly 1 matchup', async () => {
      expect(await countMatchupsForWar(harness.db, warId)).toBe(1);
    });
  });

  Scenario("Removing a contestant with votes clears only that contestant's own votes", ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let removedId: string;
    let survivorAId: string;
    let survivorBId: string;
    let survivorMatchupId: string;

    Given('a published War with 3 contestants where every matchup has a vote cast', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      await publishWarForTest(harness.db, war);
      warId = war.id;
      removedId = contestants[0]!.id;
      survivorAId = contestants[1]!.id;
      survivorBId = contestants[2]!.id;
      const matchups = await matchupsForWar(harness, warId);
      const survivorMatchup = matchups.find(
        (m) =>
          (m.contestant_a_id === survivorAId || m.contestant_b_id === survivorAId) &&
          (m.contestant_a_id === survivorBId || m.contestant_b_id === survivorBId),
      )!;
      survivorMatchupId = survivorMatchup.id;
      await castVoteOnEveryMatchup(harness, warId);
    });

    When('the creator removes one of the contestants', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server)
        .delete(`/api/v1/wars/${warId}/contestants/${removedId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then("the votes on that contestant's own matchups no longer exist", async () => {
      const rows = await harness.db
        .selectFrom('votes as v')
        .innerJoin('matchups as m', 'm.id', 'v.matchup_id')
        .select('v.id')
        .where('m.war_id', '=', warId)
        .where((eb) => eb.or([eb('m.contestant_a_id', '=', removedId), eb('m.contestant_b_id', '=', removedId)]))
        .execute();
      expect(rows).toHaveLength(0);
    });

    And('the vote on the remaining matchup still exists', async () => {
      const row = await harness.db.selectFrom('votes').selectAll().where('matchup_id', '=', survivorMatchupId).executeTakeFirst();
      expect(row).toBeDefined();
    });

    And("the surviving contestants' counters reflect only the remaining vote", async () => {
      const rows = await harness.db
        .selectFrom('contestants')
        .select(['id', 'win_count', 'appearance_count'])
        .where('id', 'in', [survivorAId, survivorBId])
        .execute();
      for (const row of rows) {
        expect(row.appearance_count).toBe(1);
      }
      const totalWins = rows.reduce((sum, row) => sum + row.win_count, 0);
      expect(totalWins).toBe(1);
    });
  });

  Scenario("Clear Votes deletes every vote and resets every contestant's counters", ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let contestantIds: string[];

    Given('a published War with 3 contestants where every matchup has a vote cast', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      await publishWarForTest(harness.db, war);
      warId = war.id;
      contestantIds = contestants.map((c) => c.id);
      await castVoteOnEveryMatchup(harness, warId);
    });

    When('the creator POSTs to /api/v1/wars/:id/clear-votes', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${warId}/clear-votes`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('no votes remain in the War', async () => {
      const rows = await harness.db
        .selectFrom('votes as v')
        .innerJoin('matchups as m', 'm.id', 'v.matchup_id')
        .select('v.id')
        .where('m.war_id', '=', warId)
        .execute();
      expect(rows).toHaveLength(0);
    });

    And("every contestant's win and appearance counters are zero", async () => {
      const rows = await harness.db
        .selectFrom('contestants')
        .select(['win_count', 'appearance_count'])
        .where('id', 'in', contestantIds)
        .execute();
      for (const row of rows) {
        expect(row.win_count).toBe(0);
        expect(row.appearance_count).toBe(0);
      }
    });
  });

  Scenario("Clear Votes works on a War that isn't published", ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;

    Given('a War in "draft" status with 3 contestants where every matchup has a vote cast', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 3);
      warId = war.id;
      // Voting normally requires a published War (spec) -- casting votes
      // directly against the matchups here (bypassing the vote endpoint's
      // own published-only gate) is purely to exercise Clear Votes against a
      // draft War that happens to carry vote rows, not to assert anything
      // about how those rows got there.
      const matchups = await matchupsForWar(harness, warId);
      for (const matchup of matchups) {
        await harness.db
          .insertInto('votes')
          .values({
            id: crypto.randomUUID(),
            matchup_id: matchup.id,
            voter_id: creatorId,
            winner_id: matchup.contestant_a_id,
            presented_left_id: matchup.contestant_a_id,
          })
          .execute();
      }
    });

    When('the creator POSTs to /api/v1/wars/:id/clear-votes', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      await request(harness.app.server).post(`/api/v1/wars/${warId}/clear-votes`).set('Authorization', `Bearer ${jwt}`).send();
    });

    Then('no votes remain in the War', async () => {
      const rows = await harness.db
        .selectFrom('votes as v')
        .innerJoin('matchups as m', 'm.id', 'v.matchup_id')
        .select('v.id')
        .where('m.war_id', '=', warId)
        .execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('Non-creator cannot clear votes', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a published War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('Voter B POSTs to /api/v1/wars/:id/clear-votes', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/clear-votes`)
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
});
