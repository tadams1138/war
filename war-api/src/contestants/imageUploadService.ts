import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import { processImage, validateImageUpload } from './imageProcessing.js';
import type { MutationOutcome } from '../shared/outcomes.js';
import type { ObjectStorage } from './storage.js';
import {
  countMediaByContestant,
  createImageMedia,
  type ContestantMedia,
} from './contestantMediaRepository.js';

export const MAX_IMAGES_PER_CONTESTANT = 10;

interface TooManyImages {
  kind: 'tooManyImages';
}
interface InvalidUpload {
  kind: 'invalidUpload';
}
export type UploadOutcome = MutationOutcome<ContestantMedia, TooManyImages | InvalidUpload>;

export interface UploadImageInput {
  contestantId: string;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

/**
 * Uploads a contestant image: validate, re-encode into WebP variants (stripping EXIF), write the variants
 * (public) and the original (private) to object storage, then persist the media row. Runs synchronously
 * within the request.
 */
export async function uploadContestantImage(
  db: Kysely<Database>,
  storage: ObjectStorage,
  input: UploadImageInput,
): Promise<UploadOutcome> {
  const validation = validateImageUpload({ mimeType: input.mimeType, sizeBytes: input.buffer.length });
  if (validation.kind !== 'ok') {
    return { kind: 'invalidUpload' };
  }

  const existingCount = await countMediaByContestant(db, input.contestantId);
  if (existingCount >= MAX_IMAGES_PER_CONTESTANT) {
    return { kind: 'tooManyImages' };
  }

  const processed = await processImage(input.buffer);
  const imageId = newId();
  const storageKey = `contestants/${input.contestantId}/${imageId}`;

  for (const variant of processed.variants) {
    await storage.putPublic(`${storageKey}-${variant.width}.webp`, variant.buffer, 'image/webp');
  }
  await storage.putPrivate(`originals/${input.contestantId}/${imageId}.${input.originalExt}`, input.buffer, input.mimeType);

  const media = await createImageMedia(db, {
    contestantId: input.contestantId,
    displayOrder: existingCount,
    storageKey,
    originalExt: input.originalExt,
    width: processed.original.width,
    height: processed.original.height,
    variantWidths: processed.variants.map((variant) => variant.width),
  });

  return { kind: 'ok', value: media };
}
