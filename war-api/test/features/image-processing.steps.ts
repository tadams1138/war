import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { giveContestantAnImage, makeContestant, makeDraftWar, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { as, uploadImage } from '../setup/apiClient.js';
import { storedObjectKeys } from '../setup/queries.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/image-processing.feature', import.meta.url)));

async function largeNoiseJpeg(): Promise<Buffer> {
  // Random noise compresses poorly, approximating a large real-world photo
  // without needing megapixel dimensions that would slow the suite down.
  const width = 2000;
  const height = 1500;
  const raw = randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

async function smallJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 90 } } }).jpeg().toBuffer();
}

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;
  let warId: string;
  let creatorId: string;
  let contestantId: string;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    const creator = await makeVoter(harness.db, 'creator');
    creatorId = creator.id;
    const war = await makeDraftWar(harness.db, creatorId);
    warId = war.id;
    const contestant = await makeContestant(harness.db, warId, 'Contestant');
    contestantId = contestant.id;
    await harness.app.ready();
  });

  function upload(buffer: Buffer, filename = 'photo.jpg', contentType = 'image/jpeg') {
    return uploadImage(harness, warId, contestantId, creatorId, buffer, { filename, contentType });
  }

  Scenario('Uploaded images are re-encoded into variants', ({ Given, When, Then, And }) => {
    let uploadResponse: request.Response;

    Given('a 10MB JPEG uploaded for a contestant', async () => {
      // Arrange
      const buffer = await largeNoiseJpeg();
      uploadResponse = await upload(buffer);
    });

    When('the upload completes', () => {
      // Act
      expect(uploadResponse.status).toBe(201);
    });

    Then('WebP variants are stored at 400, 800, and 1600 pixels wide', () => {
      // Assert
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.endsWith('-400.webp'))).toBe(true);
      expect(publicKeys.some((key) => key.endsWith('-800.webp'))).toBe(true);
      expect(publicKeys.some((key) => key.endsWith('-1600.webp'))).toBe(true);
    });

    And('the original is retained in a private prefix', () => {
      // Assert
      const privateKeys = [...harness.storage.privateObjects.keys()];
      expect(privateKeys.some((key) => key.startsWith(`originals/${contestantId}/`))).toBe(true);
    });
  });

  Scenario('EXIF metadata is stripped', ({ Given, When, Then }) => {
    let photo: Buffer;

    Given('a photo containing GPS coordinates in its EXIF data', async () => {
      // Arrange
      const plain = await smallJpeg(1200, 900);
      photo = await sharp(plain).withMetadata({ exif: { IFD0: { GPSLatitude: '40/1' } } }).toBuffer();
    });

    When('the photo is uploaded', async () => {
      // Act
      await upload(photo);
    });

    Then('no EXIF metadata is present in any variant', async () => {
      // Assert
      for (const buffer of harness.storage.publicObjects.values()) {
        const meta = await sharp(buffer).metadata();
        expect(meta.exif).toBeUndefined();
      }
    });
  });

  Scenario('Images are never upscaled', ({ Given, When, Then, And }) => {
    let image: Buffer;

    Given('an image 600 pixels wide', async () => {
      // Arrange
      image = await smallJpeg(600, 450);
    });

    When('the image is uploaded', async () => {
      // Act
      await upload(image);
    });

    Then('a 400px variant exists', () => {
      // Assert
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.endsWith('-400.webp'))).toBe(true);
    });

    And('no 800px or 1600px variant is produced', () => {
      // Assert
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.endsWith('-800.webp'))).toBe(false);
      expect(publicKeys.some((key) => key.endsWith('-1600.webp'))).toBe(false);
    });
  });

  Scenario('Originals are not publicly reachable', ({ Given, When, Then }) => {
    let originalKey: string;
    let warResponse: request.Response;

    Given('a stored original image', async () => {
      // Arrange
      const buffer = await smallJpeg(1000, 800);
      await upload(buffer);
      originalKey = [...harness.storage.privateObjects.keys()][0]!;
      expect(harness.storage.publicObjects.has(originalKey)).toBe(false);
    });

    // The API registers no /media/* route at all, so asserting a 404 from
    // one would pass whether or not originals were actually protected. The
    // real guard is that nothing under the private "originals/" prefix ever
    // appears in the public object store, and that no endpoint's response
    // ever advertises such a URL.
    When('it is requested through the public media path', async () => {
      // Act
      warResponse = await as(harness, creatorId).get(`/api/v1/wars/${warId}`);
    });

    Then('it is not served', () => {
      // Assert
      const publicKeys = [...harness.storage.publicObjects.keys()];
      expect(publicKeys.some((key) => key.startsWith('originals/'))).toBe(false);
      expect(harness.storage.publicObjects.has(originalKey)).toBe(false);

      const [contestant] = warResponse.body.contestants;
      for (const media of contestant.media) {
        for (const variant of media.variants) {
          expect(variant.url).not.toContain('originals/');
        }
      }
    });
  });

  Scenario('Responses expose variants, not raw URLs', ({ Given, When, Then }) => {
    let warResponse: request.Response;

    Given('a contestant with images', async () => {
      // Arrange
      await giveContestantAnImage(harness.db, harness.storage, contestantId);
    });

    When('any endpoint returns that contestant', async () => {
      // Act
      warResponse = await as(harness, creatorId).get(`/api/v1/wars/${warId}`);
    });

    Then('each image includes a variants array with width and url', () => {
      // Assert
      const [contestant] = warResponse.body.contestants;
      expect(contestant.media.length).toBeGreaterThan(0);
      for (const media of contestant.media) {
        expect(Array.isArray(media.variants)).toBe(true);
        expect(media.variants.length).toBeGreaterThan(0);
        for (const variant of media.variants) {
          expect(typeof variant.width).toBe('number');
          expect(typeof variant.url).toBe('string');
        }
      }
    });
  });

  Scenario("Deleting one image reclaims its stored objects but leaves the contestant's other image", ({ Given, When, Then }) => {
    let firstMediaId: string;
    let secondImageId: string;

    const allKeys = () => storedObjectKeys(harness.storage);

    Given('a contestant with two uploaded images', async () => {
      // Arrange
      const first = await upload(await smallJpeg(500, 400));
      const second = await upload(await smallJpeg(500, 400));
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const rows = await harness.db.selectFrom('contestant_media').selectAll().orderBy('display_order').execute();
      firstMediaId = rows[0]!.id;
      secondImageId = rows[1]!.storage_key!.split('/').pop()!;
    });

    When('the creator deletes the first image', async () => {
      // Act
      const response = await as(harness, creatorId).delete(`/api/v1/wars/${warId}/contestants/${contestantId}/media/${firstMediaId}`);
      expect(response.status).toBe(204);
    });

    Then("only the second image's variants and original remain in storage", () => {
      // Assert
      expect(allKeys().sort()).toEqual([
        `contestants/${contestantId}/${secondImageId}-400.webp`,
        `originals/${contestantId}/${secondImageId}.jpg`,
      ]);
    });
  });

  Scenario('A contestant may hold up to ten images',({ Given, When, Then, And }) => {
    let eleventhResponse: request.Response;

    Given('a contestant with ten images in a draft War', async () => {
      // Arrange
      for (let i = 0; i < 10; i += 1) {
        const buffer = await smallJpeg(500, 400);
        const response = await upload(buffer);
        expect(response.status).toBe(201);
      }
    });

    When('an eleventh image is uploaded', async () => {
      // Act
      const buffer = await smallJpeg(500, 400);
      eleventhResponse = await upload(buffer);
    });

    Then('the response status is 422', () => {
      // Assert
      expect(eleventhResponse.status).toBe(422);
    });

    And('the response explains that a contestant may hold at most 10 images', () => {
      // Assert
      expect(eleventhResponse.body.details).toContain('a contestant may hold at most 10 images');
    });
  });

  Scenario('Reordering an image requires a display order', ({ Given, When, Then, And }) => {
    let mediaId: string;
    let orderBefore: number;
    let response: request.Response;

    Given('a contestant with two uploaded images', async () => {
      // Arrange
      expect((await upload(await smallJpeg(500, 400))).status).toBe(201);
      const second = await upload(await smallJpeg(500, 400));
      expect(second.status).toBe(201);
      mediaId = second.body.id;
      orderBefore = second.body.display_order;
    });

    When('the creator PATCHes the second image with no display_order', async () => {
      // Act
      response = await as(harness, creatorId).patch(`/api/v1/wars/${warId}/contestants/${contestantId}/media/${mediaId}`, {});
    });

    Then('the response status is 422', () => {
      // Assert
      expect(response.status).toBe(422);
    });

    And('the second image keeps its display order', async () => {
      // Assert
      const row = await harness.db.selectFrom('contestant_media').select('display_order').where('id', '=', mediaId).executeTakeFirstOrThrow();
      expect(row.display_order).toBe(orderBefore);
    });
  });
});
