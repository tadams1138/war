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
  type CreateImageMediaInput,
} from './contestantMediaRepository.js';

export const MAX_IMAGES_PER_CONTESTANT = 10;

interface TooManyImages {
  kind: 'tooManyImages';
}
interface InvalidUpload {
  kind: 'invalidUpload';
}
export type UploadOutcome = MutationOutcome<ContestantMedia, TooManyImages | InvalidUpload>;
/** The outcome of storing an image's objects: the media row still to be written, or why it was refused. */
export type StoreImageOutcome = MutationOutcome<CreateImageMediaInput, TooManyImages | InvalidUpload>;

export interface UploadImageInput {
  contestantId: string;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

/**
 * Validates a contestant image, re-encodes it into WebP variants (stripping EXIF) and writes the variants (public) and
 * the original (private) to object storage. Returns the media row to persist; writing it is left to the caller so it
 * can share a transaction with other writes without holding that transaction open across the slow work here.
 */
export async function storeContestantImage(db: Kysely<Database>, storage: ObjectStorage, input: UploadImageInput): Promise<StoreImageOutcome> {
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

  return {
    kind: 'ok',
    value: {
      contestantId: input.contestantId,
      displayOrder: existingCount,
      storageKey,
      originalExt: input.originalExt,
      width: processed.original.width,
      height: processed.original.height,
      variantWidths: processed.variants.map((variant) => variant.width),
    },
  };
}

/** Uploads a contestant image: `storeContestantImage`, then persist the media row. Runs synchronously within the request. */
export async function uploadContestantImage(db: Kysely<Database>, storage: ObjectStorage, input: UploadImageInput): Promise<UploadOutcome> {
  const stored = await storeContestantImage(db, storage, input);
  if (stored.kind !== 'ok') return stored;
  return { kind: 'ok', value: await createImageMedia(db, stored.value) };
}
