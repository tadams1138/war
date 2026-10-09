import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { War } from '../../src/wars/warsRepository.js';
import { giveContestantAnImage, makeContestant, makeDraftWar, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { as } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/share-image.feature', import.meta.url)));

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 140, b: 210 } } }).jpeg().toBuffer();
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;
  let creatorId: string;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    const creator = await makeVoter(harness.db, 'creator');
    creatorId = creator.id;
    await harness.app.ready();
  });

  async function uploadShareImage(warId: string, voterId: string, buffer: Buffer | null): Promise<request.Response> {
    return as(harness, voterId).post(`/api/v1/wars/${warId}/share-image`, {
      configure: (req) =>
        buffer
          ? req.attach('file', buffer, { filename: 'share.jpg', contentType: 'image/jpeg' })
          : // A real "no file" upload is still multipart/form-data -- just with
            // no file part in it -- not a bodyless, non-multipart request. The
            // latter never reaches request.file()'s own `undefined` case at all;
            // @fastify/multipart rejects a non-multipart content-type outright.
            req.field('noop', 'true'),
    });
  }

  Scenario('Uploading a share image stores it and returns its URL', ({ Given, When, Then, And }) => {
    let war: War;
    let response: request.Response;

    Given('a draft War owned by its creator', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
    });

    When('the creator uploads a share image', async () => {
      // Act
      response = await uploadShareImage(war.id, creatorId, await jpeg(1600, 900));
    });

    Then('the response includes a share_image_url', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(typeof response.body.share_image_url).toBe('string');
    });

    And('the image is stored as a JPEG exactly 1200 by 630', async () => {
      // Assert
      const key = [...harness.storage.publicObjects.keys()].find((k) => k.startsWith('share-images/'))!;
      expect(key).toBeDefined();
      const meta = await sharp(harness.storage.publicObjects.get(key)!).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(630);
    });
  });

  Scenario('An oversized or oddly-shaped upload is center-cropped, not rejected', ({ Given, When, Then, And }) => {
    let war: War;
    let response: request.Response;

    Given('a draft War owned by its creator', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
    });

    When('the creator uploads a 3000 by 900 image as the share image', async () => {
      // Act
      response = await uploadShareImage(war.id, creatorId, await jpeg(3000, 900));
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the stored image is exactly 1200 by 630', async () => {
      // Assert
      const key = [...harness.storage.publicObjects.keys()].find((k) => k.startsWith('share-images/'))!;
      const meta = await sharp(harness.storage.publicObjects.get(key)!).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(630);
    });
  });

  Scenario('The original is retained privately', ({ Given, When, Then }) => {
    let war: War;

    Given('a draft War owned by its creator', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
    });

    When('the creator uploads a share image', async () => {
      // Act
      await uploadShareImage(war.id, creatorId, await jpeg(1200, 630));
    });

    Then('the original is retained in a private prefix', () => {
      // Assert
      const privateKeys = [...harness.storage.privateObjects.keys()];
      expect(privateKeys.some((key) => key.startsWith('originals/share-images/'))).toBe(true);
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.startsWith('originals/'))).toBe(false);
    });
  });

  Scenario('Uploading a share image replaces the previous one', ({ Given, When, Then }) => {
    let war: War;
    let firstUrl: string;
    let response: request.Response;

    Given('a draft War that already has a share image', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
      const first = await uploadShareImage(war.id, creatorId, await jpeg(1200, 630));
      firstUrl = first.body.share_image_url;
    });

    When('the creator uploads a new share image', async () => {
      // Act
      response = await uploadShareImage(war.id, creatorId, await jpeg(900, 1400));
    });

    Then("the War's share_image_url points at the new image", async () => {
      // Assert
      expect(response.status).toBe(200);
      const detail = await as(harness, creatorId).get(`/api/v1/wars/${war.id}`);
      // Same deterministic key every time (spec: replaces, not accumulates)
      // -- the URL string itself doesn't change, but the bytes behind it do.
      expect(detail.body.share_image_url).toBe(firstUrl);
      const key = [...harness.storage.publicObjects.keys()].filter((k) => k.startsWith('share-images/'));
      expect(key).toHaveLength(1);
    });
  });

  Scenario('No file is rejected', ({ Given, When, Then }) => {
    let war: War;
    let response: request.Response;

    Given('a draft War owned by its creator', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
    });

    When('the creator submits the share image upload with no file', async () => {
      // Act
      response = await uploadShareImage(war.id, creatorId, null);
    });

    Then('the response status is 422', () => {
      // Assert
      expect(response.status).toBe(422);
    });
  });

  Scenario('Only the creator may set a War\'s share image', ({ Given, When, Then }) => {
    let war: War;
    let response: request.Response;

    Given('a draft War owned by another voter', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
    });

    When('a voter who is not its creator uploads a share image', async () => {
      // Act
      const other = await makeVoter(harness.db, 'other');
      response = await uploadShareImage(war.id, other.id, await jpeg(1200, 630));
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });
  });

  Scenario("A published War's share image can still be changed", ({ Given, When, Then }) => {
    let war: War;
    let response: request.Response;

    Given('a published War owned by its creator', async () => {
      // Arrange
      const draft = await makeDraftWar(harness.db, creatorId);
      const a = await makeContestant(harness.db, draft.id, 'A');
      const b = await makeContestant(harness.db, draft.id, 'B');
      await giveContestantAnImage(harness.db, harness.storage, a.id);
      await giveContestantAnImage(harness.db, harness.storage, b.id);
      war = await publishWarForTest(harness.db, draft);
    });

    When('the creator uploads a share image', async () => {
      // Act
      response = await uploadShareImage(war.id, creatorId, await jpeg(1200, 630));
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });
  });

  Scenario('A War with no share image has none in its response', ({ Given, When, Then }) => {
    let war: War;
    let response: request.Response;

    Given('a draft War with no share image', async () => {
      // Arrange
      war = await makeDraftWar(harness.db, creatorId);
    });

    When('any endpoint returns that War', async () => {
      // Act
      response = await as(harness, creatorId).get(`/api/v1/wars/${war.id}`);
    });

    Then('its share_image_url is null', () => {
      // Assert
      expect(response.body.share_image_url).toBeNull();
    });
  });
});
