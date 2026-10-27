import { fileURLToPath } from 'node:url';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import sharp from 'sharp';
import { as, uploadImage } from '../setup/apiClient.js';
import { makeContestant, makeDraftWar, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/media-mode.feature', import.meta.url)));
const youtube = 'https://youtu.be/abc12345678';

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;
  let warId: string;
  let creatorId: string;
  let contestantId: string;
  let url = youtube;
  let start_seconds: number | undefined;
  let end_seconds: number | undefined;
  let embeddable = true;
  let duration = 'PT40S';
  let response: { status: number; body: Record<string, unknown> };

  BeforeEachScenario(async () => {
    // Arrange
    await truncateAll();
    url = youtube; start_seconds = undefined; end_seconds = undefined; embeddable = true; duration = 'PT40S';
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [{ contentDetails: { duration }, status: { embeddable, privacyStatus: 'public' }, snippet: { thumbnails: { high: { url: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg' } } } }] }), { status: 200 })) as typeof fetch;
    harness = await buildTestHarness(fetcher);
    const voter = await makeVoter(harness.db, 'creator');
    creatorId = voter.id;
    await harness.app.ready();
  });

  async function draft(mode: 'image' | 'video'): Promise<void> {
    // Arrange
    const war = await makeDraftWar(harness.db, creatorId, { mediaMode: mode });
    warId = war.id;
    contestantId = (await makeContestant(harness.db, warId, 'First')).id;
  }

  async function attach(): Promise<void> {
    // Act
    response = await as(harness, creatorId).post(`/api/v1/wars/${warId}/contestants/${contestantId}/videos`, { url, start_seconds, end_seconds });
  }

  Scenario('A video War rejects image uploads', ({ Given, When, Then }) => {
    Given('a draft War with media_mode video', async () => { // Arrange
      await draft('video');
    });
    When('an image is uploaded for a contestant', async () => { // Act
      const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).jpeg().toBuffer();
      response = await uploadImage(harness, warId, contestantId, creatorId, jpeg, { filename: 'test.jpg', contentType: 'image/jpeg' });
    });
    Then('the response status is 409', () => { // Assert
      expect(response.status).toBe(409);
    });
  });

  Scenario('An image War rejects video attachment', ({ Given, When, Then }) => {
    Given('a draft War with media_mode image', async () => { // Arrange
      await draft('image');
    });
    When('a video URL is attached to a contestant', attach);
    Then('the response status is 409', () => { // Assert
      expect(response.status).toBe(409);
    });
  });

  Scenario('Publishing requires media matching the mode', ({ Given, And, When, Then }) => {
    Given('a draft War with media_mode video', async () => { // Arrange
      await draft('video');
    });
    And('a contestant with no video attached', async () => { // Arrange
      await makeContestant(harness.db, warId, 'Second');
    });
    When('the creator publishes the War', async () => { // Act
      response = await as(harness, creatorId).post(`/api/v1/wars/${warId}/publish`, {});
    });
    Then('the response status is 422', () => { // Assert
      expect(response.status).toBe(422);
    });
    And('the War remains draft', async () => { // Assert
      const war = await harness.db.selectFrom('wars').select('status').where('id', '=', warId).executeTakeFirstOrThrow();
      expect(war.status).toBe('draft');
    });
  });

  Scenario('An unembeddable video is rejected when added', ({ Given, When, Then, And }) => {
    Given('a video URL whose owner has disabled embedding', async () => { // Arrange
      await draft('video'); embeddable = false;
    });
    When('it is attached to a contestant', attach);
    Then('the response status is 422', () => { // Assert
      expect(response.status).toBe(422);
    });
    And('no media record is created', async () => { // Assert
      const rows = await harness.db.selectFrom('contestant_media').select('id').execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('An unsupported provider is rejected', ({ Given, When, Then }) => {
    Given('a video URL from a provider outside the allow-list', async () => { // Arrange
      await draft('video'); url = 'https://example.com/watch?v=abc12345678';
    });
    When('it is attached to a contestant', attach);
    Then('the response status is 422', () => { // Assert
      expect(response.status).toBe(422);
    });
  });

  Scenario('Overlong videos are rejected', ({ Given, When, Then, And }) => {
    Given('a video whose effective duration is 90 seconds', async () => { // Arrange
      await draft('video'); duration = 'PT90S';
    });
    When('it is attached to a contestant', attach);
    Then('the response status is 422', () => { // Assert
      expect(response.status).toBe(422);
    });
    And('the response explains the clip must not exceed 60 seconds', () => { // Assert
      expect(response.body.details).toEqual(['Clip duration must not exceed 60 seconds']);
    });
  });

  Scenario('A clip window shortens a longer video', ({ Given, When, Then }) => {
    Given('a five-minute video with start_seconds 60 and end_seconds 80', async () => { // Arrange
      await draft('video'); duration = 'PT5M'; start_seconds = 60; end_seconds = 80;
    });
    When('it is attached to a contestant', attach);
    Then('the media record stores a duration of 20 seconds', async () => { // Assert
      expect(response.status).toBe(201);
      const row = await harness.db.selectFrom('contestant_media').select('duration_seconds').executeTakeFirstOrThrow();
      expect(row.duration_seconds).toBe(20);
    });
  });

  Scenario('A contestant holds only one video', ({ Given, When, Then, And }) => {
    Given('a contestant with a video', async () => { // Arrange
      await draft('video'); await attach(); expect(response.status).toBe(201);
    });
    When('another video is attached to the same contestant', attach);
    Then('the response status is 409', () => { // Assert
      expect(response.status).toBe(409);
    });
    And('the original video remains attached', async () => { // Assert
      const rows = await harness.db.selectFrom('contestant_media').select('video_id').execute();
      expect(rows.map((row) => row.video_id)).toEqual(['abc12345678']);
    });
  });

  Scenario('Replacing a video preserves the original when validation fails', ({ Given, When, Then, And }) => {
    Given('a contestant with a video', async () => { // Arrange
      await draft('video'); await attach(); expect(response.status).toBe(201);
    });
    When('replacement with an unsupported provider is attempted', async () => { // Act
      response = await as(harness, creatorId).put(`/api/v1/wars/${warId}/contestants/${contestantId}/videos`, { url: 'https://invalid.test/video' });
    });
    Then('the response status is 422', () => { // Assert
      expect(response.status).toBe(422);
    });
    And('the original video remains attached', async () => { // Assert
      const rows = await harness.db.selectFrom('contestant_media').select('video_id').execute();
      expect(rows.map((row) => row.video_id)).toEqual(['abc12345678']);
    });
  });

  Scenario('Video responses carry an identity, never an embed URL', ({ Given, When, Then, And }) => {
    Given('a contestant with a video', async () => { // Arrange
      await draft('video'); await attach(); expect(response.status).toBe(201);
    });
    When('the War detail endpoint returns that contestant', async () => { // Act
      response = await as(harness, creatorId).get(`/api/v1/wars/${warId}`);
    });
    Then('the media object names a provider and a video id', () => { // Assert
      const media = (response.body.contestants as Array<{ media: Array<Record<string, unknown>> }>)[0]!.media[0]!;
      expect(media).toMatchObject({ provider: 'youtube', video_id: 'abc12345678' });
    });
    And('it contains no embed URL', () => { // Assert
      expect(JSON.stringify(response.body)).not.toContain('youtube-nocookie.com/embed');
    });
  });
});
