import type { ObjectStorage } from '../../src/contestants/storage.js';

/**
 * A test double for the object store: contestant image uploads in tests
 * never need a real S3-compatible endpoint. The processing pipeline that
 * feeds it (resize, EXIF strip) runs for real; only the "write bytes
 * somewhere durable" boundary is stubbed.
 */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly publicObjects = new Map<string, Buffer>();
  readonly privateObjects = new Map<string, Buffer>();
  private readonly publicBaseUrl: string;

  constructor(publicBaseUrl: string) {
    this.publicBaseUrl = publicBaseUrl;
  }

  async putPublic(key: string, body: Buffer): Promise<string> {
    this.publicObjects.set(key, body);
    return `${this.publicBaseUrl}/${key}`;
  }

  async putPrivate(key: string, body: Buffer): Promise<void> {
    this.privateObjects.set(key, body);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const objects of [this.publicObjects, this.privateObjects]) {
      for (const key of [...objects.keys()]) {
        if (key.startsWith(prefix)) objects.delete(key);
      }
    }
  }
}
