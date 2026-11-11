import sharp from 'sharp';

export const VARIANT_WIDTHS = [400, 800, 1600] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageVariant {
  width: number;
  buffer: Buffer;
}

export interface ProcessedImage {
  original: { buffer: Buffer; width: number; height: number };
  variants: ImageVariant[];
}

export interface UploadValidationInput {
  mimeType: string;
  sizeBytes: number;
}

export type UploadValidationResult = { kind: 'ok' } | { kind: 'invalid'; reason: string };

/** Maps an upload's MIME type to the file extension its original is stored under. */
export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

/** Validates upload type and size before any processing. */
export function validateImageUpload(input: UploadValidationInput): UploadValidationResult {
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    return { kind: 'invalid', reason: 'file exceeds the 10MB limit' };
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return { kind: 'invalid', reason: `unsupported file type: ${input.mimeType}` };
  }
  return { kind: 'ok' };
}

/**
 * Re-encodes an uploaded image into WebP variants at 400/800/1600px wide, never upscaling. Phone cameras store the
 * sensor's pixels and an EXIF orientation tag saying how to show them, so the pixels are turned upright first and the
 * sizes taken as shown; the variants carry no metadata (sharp writes none unless `.withMetadata()` is called), so no
 * viewer can apply the orientation a second time. The private original is kept exactly as uploaded.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const { autoOrient } = await sharp(input).metadata();
  const sourceWidth = autoOrient.width;
  const sourceHeight = autoOrient.height;

  const variants: ImageVariant[] = [];
  for (const width of VARIANT_WIDTHS) {
    if (sourceWidth < width) {
      continue;
    }
    const buffer = await sharp(input).autoOrient().resize({ width }).webp().toBuffer();
    variants.push({ width, buffer });
  }

  return {
    original: { buffer: input, width: sourceWidth, height: sourceHeight },
    variants,
  };
}
