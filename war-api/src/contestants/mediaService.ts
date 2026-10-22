import type { FastifyBaseLogger } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/types.js';
import { asOwnerAction, loadOwnedWar, type Caller, type OwnedWarOutcome } from '../wars/warAccess.js';
import { cleanUpUnlessSaved, deleteMediaObjects, imageMediaPrefixes } from '../wars/warMediaStorage.js';
import type { MutationOutcome } from '../shared/outcomes.js';
import { findContestantById } from './contestantsRepository.js';
import { createImageMedia, deleteMedia, findMediaById, setDisplayOrder, type ContestantMedia } from './contestantMediaRepository.js';
import { MAX_IMAGES_PER_CONTESTANT, storeContestantImage } from './imageUploadService.js';
import type { ObjectStorage } from './storage.js';

/** Whether the caller may manage the contestant's War and the contestant belongs to it (§6.1, §6.2), checked before any slow work. */
async function guardOwnedContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  caller: Caller,
): Promise<OwnedWarOutcome> {
  const warGuard = await loadOwnedWar(db, warId, caller);
  if (warGuard.kind !== 'ok') return warGuard;

  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return { kind: 'notFound' };

  return warGuard;
}

/** The media row, only if it belongs to this contestant -- `null` covers both "doesn't exist" and "wrong contestant". */
async function findMediaOfContestant(db: Kysely<Database> | Transaction<Database>, contestantId: string, mediaId: string): Promise<ContestantMedia | null> {
  const media = await findMediaById(db, mediaId);
  return media && media.contestantId === contestantId ? media : null;
}

/** The contestant, only if it belongs to this War, read inside the owner action's transaction. */
async function contestantBelongsToWar(db: Kysely<Database> | Transaction<Database>, warId: string, contestantId: string): Promise<boolean> {
  const contestant = await findContestantById(db, contestantId);
  return contestant?.warId === warId;
}

export interface AddImageInput {
  warId: string;
  contestantId: string;
  caller: Caller;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

export type AddImageOutcome = MutationOutcome<ContestantMedia>;

/**
 * Access is checked first, then the image is processed and its objects uploaded outside any transaction; only the
 * media row and the Admin's log entry share one. If that transaction fails or is refused, the uploaded objects are
 * deleted again (best effort).
 */
export async function addContestantImage(db: Kysely<Database>, storage: ObjectStorage, log: FastifyBaseLogger, input: AddImageInput): Promise<AddImageOutcome> {
  const guard = await guardOwnedContestant(db, input.warId, input.contestantId, input.caller);
  if (guard.kind !== 'ok') return guard;

  const stored = await storeContestantImage(db, storage, {
    contestantId: input.contestantId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    originalExt: input.originalExt,
  });

  if (stored.kind === 'tooManyImages') {
    return { kind: 'validationError', errors: [`a contestant may hold at most ${MAX_IMAGES_PER_CONTESTANT} images`] };
  }
  if (stored.kind === 'invalidUpload') {
    return { kind: 'validationError', errors: ['invalid image upload'] };
  }
  const uploadedPrefixes = imageMediaPrefixes(input.contestantId, stored.value.storageKey);
  const logContext = { warId: input.warId, contestantId: input.contestantId };
  return cleanUpUnlessSaved(storage, log, uploadedPrefixes, logContext, () =>
    asOwnerAction<ContestantMedia>(db, input.warId, input.caller, 'add_image', async (trx) => {
      if (!(await contestantBelongsToWar(trx, input.warId, input.contestantId))) return { kind: 'notFound' };
      return { kind: 'ok', value: await createImageMedia(trx, stored.value) };
    }),
  );
}

export async function reorderContestantMedia(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  mediaId: string,
  caller: Caller,
  displayOrder: number,
): Promise<MutationOutcome<void>> {
  return asOwnerAction(db, warId, caller, 'reorder_images', async (trx) => {
    if (!(await contestantBelongsToWar(trx, warId, contestantId))) return { kind: 'notFound' };
    if (!(await findMediaOfContestant(trx, contestantId, mediaId))) return { kind: 'notFound' };

    await setDisplayOrder(trx, mediaId, displayOrder);
    return { kind: 'ok', value: undefined };
  });
}

/** Deletes the row (with the Admin's log entry), then (after it is gone) the image's stored variants and original, best effort. */
export async function removeContestantMedia(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  warId: string,
  contestantId: string,
  mediaId: string,
  caller: Caller,
): Promise<MutationOutcome<void>> {
  const removed = await asOwnerAction<ContestantMedia>(db, warId, caller, 'remove_image', async (trx) => {
    if (!(await contestantBelongsToWar(trx, warId, contestantId))) return { kind: 'notFound' };
    const media = await findMediaOfContestant(trx, contestantId, mediaId);
    if (!media) return { kind: 'notFound' };

    await deleteMedia(trx, mediaId);
    return { kind: 'ok', value: media };
  });
  if (removed.kind !== 'ok') return removed;
  await deleteMediaObjects(storage, log, imageMediaPrefixes(contestantId, removed.value.storageKey), { warId, contestantId, mediaId });
  return { kind: 'ok', value: undefined };
}
