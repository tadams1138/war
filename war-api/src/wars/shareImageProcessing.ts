import sharp from 'sharp';

export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;

/**
 * A War's share image (spec §9.1) follows none of contestants' own
 * processing rules: one fixed 1200x630 size, not a set of responsive
 * variants, and JPEG rather than the modern format contestant media uses --
 * so the same asset works as both the in-app card thumbnail and a
 * third-party link-preview image without a second encoding. `fit: 'cover'`
 * center-crops a source of any aspect ratio down to exactly this size
 * rather than letterboxing or rejecting it; sharp omits metadata from its
 * output unless `.withMetadata()` is called, which it never is here, same
 * as contestant media's own stripping (imageProcessing.ts).
 */
export async function processShareImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();
}
