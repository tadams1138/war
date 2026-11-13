import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3ObjectStorage } from '../../src/contestants/storage.js';

describe('storage public uploads', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uploads a public variant without an ACL and preserves its public URL', async () => {
    // Arrange
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue(undefined);
    const storage = new S3ObjectStorage({
      region: 'auto',
      bucket: 'war-media-test',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      publicBaseUrl: 'https://example.test/media',
    });
    const body = Buffer.from('image');

    // Act
    const url = await storage.putPublic('contestants/image.webp', body, 'image/webp');

    // Assert
    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: 'war-media-test',
      Key: 'contestants/image.webp',
      Body: body,
      ContentType: 'image/webp',
    });
    expect((command as PutObjectCommand).input).not.toHaveProperty('ACL');
    expect(url).toBe('https://example.test/media/contestants/image.webp');
  });
});
