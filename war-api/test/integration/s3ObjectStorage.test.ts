import { CreateBucketCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3ObjectStorage } from '../../src/contestants/storage.js';

/**
 * Characterization test: `deletePrefix` against a real S3-compatible store (Adobe S3Mock (MinIO no longer publishes
 * pullable images) in a Testcontainers container, started once per file like `testDb.ts` does for Postgres).
 */
describe('S3ObjectStorage.deletePrefix (S3Mock)', () => {
  const accessKeyId = 'test';
  const secretAccessKey = 'test';
  const bucket = 'war-test';
  let container: StartedTestContainer;
  let storage: S3ObjectStorage;
  let client: S3Client;

  beforeAll(async () => {
    container = await new GenericContainer('adobe/s3mock:4.11.0')
      .withExposedPorts(9090)
      .withWaitStrategy(Wait.forHttp('/favicon.ico', 9090).forStatusCodeMatching(() => true))
      .start();
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(9090)}`;
    client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    storage = new S3ObjectStorage({
      endpoint,
      region: 'us-east-1',
      bucket,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl: `${endpoint}/${bucket}`,
    });
  });

  afterAll(async () => {
    client?.destroy();
    await container?.stop();
  });

  async function keysUnder(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      keys.push(...(page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : [])));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }

  const body = Buffer.from('x');

  it('deletes public and private objects under the prefix and leaves every other key', async () => {
    // Arrange
    await storage.putPublic('basic/war-a/one.webp', body, 'image/webp');
    await storage.putPublic('basic/war-a/two.webp', body, 'image/webp');
    await storage.putPrivate('basic/war-a/original/one.jpg', body, 'image/jpeg');
    await storage.putPublic('basic/war-b/one.webp', body, 'image/webp');
    await storage.putPrivate('basic/war-b/original/one.jpg', body, 'image/jpeg');
    await storage.putPublic('basic/war-ab/one.webp', body, 'image/webp');

    // Act
    await storage.deletePrefix('basic/war-a/');

    // Assert
    expect(await keysUnder('basic/')).toEqual([
      'basic/war-ab/one.webp',
      'basic/war-b/one.webp',
      'basic/war-b/original/one.jpg',
    ]);
  });

  it('treats a prefix that matches nothing as a no-op', async () => {
    // Arrange
    await storage.putPublic('noop/keep.webp', body, 'image/webp');

    // Act
    await storage.deletePrefix('noop/missing/');

    // Assert
    expect(await keysUnder('noop/')).toEqual(['noop/keep.webp']);
  });

  it('deletes every page when more than 1000 objects share the prefix', async () => {
    // Arrange
    const count = 2500;
    const puts = Array.from({ length: count }, (_, i) => {
      const key = `paged/war-big/${String(i).padStart(5, '0')}.webp`;
      return i % 2 === 0 ? storage.putPublic(key, body, 'image/webp') : storage.putPrivate(key, body, 'image/webp');
    });
    for (let i = 0; i < puts.length; i += 250) {
      await Promise.all(puts.slice(i, i + 250));
    }
    await storage.putPublic('paged/war-other/keep.webp', body, 'image/webp');
    expect(await keysUnder('paged/war-big/')).toHaveLength(count);

    // Act
    await storage.deletePrefix('paged/war-big/');

    // Assert
    expect(await keysUnder('paged/')).toEqual(['paged/war-other/keep.webp']);
  }, 120_000);
});
