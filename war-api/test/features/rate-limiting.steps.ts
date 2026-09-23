import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { countVotesByVoterInWar } from '../../src/matchups/matchupsRepository.js';
import { findVote } from '../../src/votes/votesRepository.js';
import { publishWarForTest, makeContestant, makeDraftWar, makeDraftWarWithContestants, makeVoter, joinWarAsVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/rate-limiting.feature', import.meta.url)));

// 66 pairs (C(12,2)) comfortably clears the 60/minute vote limit with room
// for the "one more" attempt every scenario below needs.
const CONTESTANTS_FOR_60_PLUS_MATCHUPS = 12;

async function getNextMatchup(harness: TestHarness, warId: string, voterId: string) {
  await harness.app.ready();
  const jwt = await harness.jwtFor(voterId);
  return request(harness.app.server).get(`/api/v1/wars/${warId}/matchups/next`).set('Authorization', `Bearer ${jwt}`);
}

async function postVote(harness: TestHarness, warId: string, matchupId: string, voterId: string, winnerId: string) {
  await harness.app.ready();
  const jwt = await harness.jwtFor(voterId);
  return request(harness.app.server)
    .post(`/api/v1/wars/${warId}/matchups/${matchupId}/vote`)
    .set('Authorization', `Bearer ${jwt}`)
    .send({ winner_id: winnerId });
}

/** Casts `count` votes for `voterId`, each on a fresh matchup. Returns the responses, in order. */
async function castVotes(harness: TestHarness, warId: string, voterId: string, count: number): Promise<request.Response[]> {
  const responses: request.Response[] = [];
  for (let i = 0; i < count; i += 1) {
    const next = await getNextMatchup(harness, warId, voterId);
    const voteResponse = await postVote(harness, warId, next.body.matchup.id, voterId, next.body.matchup.left.id);
    responses.push(voteResponse);
  }
  return responses;
}

async function tinyJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 200, b: 90 } } }).jpeg().toBuffer();
}

async function uploadImage(harness: TestHarness, warId: string, contestantId: string, voterId: string, buffer: Buffer) {
  await harness.app.ready();
  const jwt = await harness.jwtFor(voterId);
  return request(harness.app.server)
    .post(`/api/v1/wars/${warId}/contestants/${contestantId}/images`)
    .set('Authorization', `Bearer ${jwt}`)
    .attach('file', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
}

async function createWar(harness: TestHarness, voterId: string, title: string) {
  await harness.app.ready();
  const jwt = await harness.jwtFor(voterId);
  return request(harness.app.server).post('/api/v1/wars').set('Authorization', `Bearer ${jwt}`).send({ title });
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Voting beyond the per-voter limit is throttled', ({ Given, When, Then, And }) => {
    let warId: string;
    let voterId: string;
    let response: request.Response;

    Given('a voter who has cast 60 votes within one minute', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, CONTESTANTS_FOR_60_PLUS_MATCHUPS);
      const activated = await publishWarForTest(harness.db, war);
      warId = activated.id;
      const voter = await makeVoter(harness.db, 'voter');
      voterId = voter.id;
      await joinWarAsVoter(harness.db, warId, voterId);
      await castVotes(harness, warId, voterId, 60);
    });

    When('they cast another vote', async () => {
      const next = await getNextMatchup(harness, warId, voterId);
      response = await postVote(harness, warId, next.body.matchup.id, voterId, next.body.matchup.left.id);
    });

    Then('the response status is 429', () => {
      expect(response.status).toBe(429);
    });

    And('a Retry-After header is present', () => {
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  Scenario('Limits are keyed by voter, not by address', ({ Given, When, Then }) => {
    let warId: string;
    let throttledVoterId: string;
    let otherVoterId: string;
    let response: request.Response;

    Given('two voters sharing one public IP address', async () => {
      // supertest's requests all originate from this same test process
      // regardless -- what this scenario actually proves is that voter A
      // reaching the limit does not consume voter B's own bucket.
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, CONTESTANTS_FOR_60_PLUS_MATCHUPS);
      const activated = await publishWarForTest(harness.db, war);
      warId = activated.id;

      const throttledVoter = await makeVoter(harness.db, 'voter-a');
      throttledVoterId = throttledVoter.id;
      await joinWarAsVoter(harness.db, warId, throttledVoterId);

      const otherVoter = await makeVoter(harness.db, 'voter-b');
      otherVoterId = otherVoter.id;
      await joinWarAsVoter(harness.db, warId, otherVoterId);
    });

    When('one of them reaches the vote rate limit', async () => {
      await castVotes(harness, warId, throttledVoterId, 60);
      const next = await getNextMatchup(harness, warId, throttledVoterId);
      const throttledResponse = await postVote(harness, warId, next.body.matchup.id, throttledVoterId, next.body.matchup.left.id);
      expect(throttledResponse.status).toBe(429);
    });

    Then('the other can still vote', async () => {
      const next = await getNextMatchup(harness, warId, otherVoterId);
      response = await postVote(harness, warId, next.body.matchup.id, otherVoterId, next.body.matchup.left.id);
      expect(response.status).toBe(201);
    });
  });

  Scenario('Throttled votes are not recorded', ({ Given, When, Then, And }) => {
    let warId: string;
    let voterId: string;
    let rejectedMatchupId: string;
    let votesBefore: number;

    Given('a voter who is being rate limited', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, CONTESTANTS_FOR_60_PLUS_MATCHUPS);
      const activated = await publishWarForTest(harness.db, war);
      warId = activated.id;
      const voter = await makeVoter(harness.db, 'voter');
      voterId = voter.id;
      await joinWarAsVoter(harness.db, warId, voterId);
      await castVotes(harness, warId, voterId, 60);
      votesBefore = await countVotesByVoterInWar(harness.db, warId, voterId);
    });

    When('their vote is rejected with 429', async () => {
      const next = await getNextMatchup(harness, warId, voterId);
      rejectedMatchupId = next.body.matchup.id;
      const voteResponse = await postVote(harness, warId, rejectedMatchupId, voterId, next.body.matchup.left.id);
      expect(voteResponse.status).toBe(429);
    });

    Then('no Vote record is created', async () => {
      const vote = await findVote(harness.db, rejectedMatchupId, voterId);
      expect(vote).toBeUndefined();
    });

    And('no counters change', async () => {
      const votesAfter = await countVotesByVoterInWar(harness.db, warId, voterId);
      expect(votesAfter).toBe(votesBefore);
    });
  });

  Scenario('Creating Wars beyond the per-voter limit is throttled', ({ Given, When, Then, And }) => {
    let voterId: string;
    let response: request.Response;

    Given('a voter who has created 10 Wars within one hour', async () => {
      const voter = await makeVoter(harness.db, 'creator');
      voterId = voter.id;
      for (let i = 0; i < 10; i += 1) {
        const created = await createWar(harness, voterId, `War ${i}`);
        expect(created.status).toBe(201);
      }
    });

    When('they create another War', async () => {
      response = await createWar(harness, voterId, 'War 11');
    });

    Then('the response status is 429', () => {
      expect(response.status).toBe(429);
    });

    And('a Retry-After header is present', () => {
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  Scenario('Uploading images beyond the per-voter limit is throttled', ({ Given, When, Then, And }) => {
    let warId: string;
    let contestantId: string;
    let voterId: string;
    let response: request.Response;

    Given('a voter who has uploaded 100 images within one hour', async () => {
      const voter = await makeVoter(harness.db, 'creator');
      voterId = voter.id;
      const war = await makeDraftWar(harness.db, voterId);
      warId = war.id;
      const contestant = await makeContestant(harness.db, warId, 'Contestant');
      contestantId = contestant.id;
      const buffer = await tinyJpeg();
      // The per-contestant cap (10) rejects most of these past the first
      // ten with a 422 ("too many images"), but the rate limiter's
      // preHandler runs before that check and counts every attempt
      // regardless -- 100 requests still spend the full per-voter budget.
      for (let i = 0; i < 100; i += 1) {
        await uploadImage(harness, warId, contestantId, voterId, buffer);
      }
    });

    When('they upload another image', async () => {
      const buffer = await tinyJpeg();
      response = await uploadImage(harness, warId, contestantId, voterId, buffer);
    });

    Then('the response status is 429', () => {
      expect(response.status).toBe(429);
    });

    And('a Retry-After header is present', () => {
      expect(response.headers['retry-after']).toBeDefined();
    });
  });
});
