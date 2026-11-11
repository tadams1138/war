import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processImage, validateImageUpload } from '../../src/contestants/imageProcessing.js';
import { phonePhoto, quadrantColours, UPRIGHT_QUADRANTS, type Orientation } from '../setup/orientedPhotos.js';

async function makeJpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  }).jpeg();

  if (!withExif) {
    return base.toBuffer();
  }

  const plain = await base.toBuffer();
  return sharp(plain)
    .withMetadata({ exif: { IFD0: { Make: 'TestCam', GPSLatitude: '40/1' } } })
    .toBuffer();
}

describe('processImage', () => {
  it('re-encodes into WebP variants at 400, 800, and 1600 wide', async () => {
    // Arrange
    const source = await makeJpeg(2000, 1500);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.variants.map((v) => v.width).sort((a, b) => a - b)).toEqual([400, 800, 1600]);
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(variant.width);
    }
  });

  it('strips EXIF metadata from every variant', async () => {
    // Arrange
    const source = await makeJpeg(2000, 1500, true);
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.exif).toBeTruthy(); // sanity check the fixture actually carries EXIF

    // Act
    const result = await processImage(source);

    // Assert
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.exif).toBeUndefined();
    }
  });

  it('never upscales: omits variants wider than the source', async () => {
    // Arrange
    const source = await makeJpeg(600, 450);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.variants.map((v) => v.width)).toEqual([400]);
  });

  it('retains the original dimensions for aspect ratio', async () => {
    // Arrange
    const source = await makeJpeg(800, 600);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.original.width).toBe(800);
    expect(result.original.height).toBe(600);
  });
});

describe('processImage orientation', () => {
  const ALL_ORIENTATIONS: Orientation[] = [1, 2, 3, 4, 5, 6, 7, 8];

  it.each(ALL_ORIENTATIONS)('stores every variant upright for EXIF orientation %i', async (orientation) => {
    // Arrange
    const source = await phonePhoto(900, 1200, orientation);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.variants.map((v) => v.width)).toEqual([400, 800]);
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.width).toBe(variant.width);
      expect(meta.height).toBe(Math.round((variant.width * 1200) / 900));
      expect(meta.orientation).toBeUndefined();
      expect(await quadrantColours(variant.buffer)).toEqual(UPRIGHT_QUADRANTS);
    }
  });

  it.each(ALL_ORIENTATIONS)('reports the dimensions as shown for EXIF orientation %i', async (orientation) => {
    // Arrange
    const source = await phonePhoto(900, 1200, orientation);

    // Act
    const result = await processImage(source);

    // Assert
    expect({ width: result.original.width, height: result.original.height }).toEqual({ width: 900, height: 1200 });
  });

  it('chooses variant widths from the width as shown, not as stored', async () => {
    // Arrange: stored 1700 wide, but shown as a portrait 1000 wide.
    const source = await phonePhoto(1000, 1700, 6);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.variants.map((v) => v.width)).toEqual([400, 800]);
  });

  it('keeps an image with no EXIF metadata as it is', async () => {
    // Arrange
    const source = await phonePhoto(1200, 900);

    // Act
    const result = await processImage(source);

    // Assert
    expect({ width: result.original.width, height: result.original.height }).toEqual({ width: 1200, height: 900 });
    for (const variant of result.variants) {
      expect(await quadrantColours(variant.buffer)).toEqual(UPRIGHT_QUADRANTS);
    }
  });

  it('keeps the uploaded original byte for byte', async () => {
    // Arrange
    const source = await phonePhoto(900, 1200, 6);

    // Act
    const result = await processImage(source);

    // Assert
    expect(result.original.buffer.equals(source)).toBe(true);
  });
});

describe('validateImageUpload', () => {
  it('accepts a JPEG under the 10MB limit', () => {
    // Arrange
    const sizeBytes = 5 * 1024 * 1024;
    const mimeType = 'image/jpeg';

    // Act
    const result = validateImageUpload({ mimeType, sizeBytes });

    // Assert
    expect(result.kind).toBe('ok');
  });

  it('rejects a file over 10MB', () => {
    // Arrange
    const sizeBytes = 11 * 1024 * 1024;
    const mimeType = 'image/png';

    // Act
    const result = validateImageUpload({ mimeType, sizeBytes });

    // Assert
    expect(result.kind).toBe('invalid');
  });

  it('rejects an unsupported mime type', () => {
    // Arrange
    const sizeBytes = 1024;
    const mimeType = 'image/gif';

    // Act
    const result = validateImageUpload({ mimeType, sizeBytes });

    // Assert
    expect(result.kind).toBe('invalid');
  });
});
