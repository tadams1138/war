import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processShareImage } from '../../src/wars/shareImageProcessing.js';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 80, g: 120, b: 200 } } }).jpeg().toBuffer();
}

describe('processShareImage', () => {
  it('center-crops any source down to exactly 1200x630', async () => {
    // Arrange -- a much wider-than-1.91:1 source, the shape most likely to
    // reveal a cover-fit bug (letterboxing instead of cropping).
    const source = await makeJpeg(3000, 900);

    // Act
    const result = await processShareImage(source);

    // Assert
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it('upscales a source smaller than 1200x630 rather than rejecting it', async () => {
    // Arrange
    const source = await makeJpeg(400, 300);

    // Act
    const result = await processShareImage(source);

    // Assert
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it('outputs JPEG regardless of source format', async () => {
    // Arrange
    const source = await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
      .png()
      .toBuffer();

    // Act
    const result = await processShareImage(source);

    // Assert
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('strips EXIF metadata', async () => {
    // Arrange
    const plain = await makeJpeg(1200, 630);
    const withExif = await sharp(plain).withMetadata({ exif: { IFD0: { GPSLatitude: '40/1' } } }).toBuffer();

    // Act
    const result = await processShareImage(withExif);

    // Assert
    const meta = await sharp(result).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
