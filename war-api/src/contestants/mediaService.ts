import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { loadOwnedWar, recordOwnerAction, type Caller, type OwnedWarOutcome } from '../wars/warAccess.js';
import { deleteMediaObjects, imageMediaPrefixes } from '../wars/warMediaStorage.js';
import type { MutationOutcome } from '../shared/outcomes.js';
import { findContestantById } from './contestantsRepository.js';
import { deleteMedia, findMediaById, setDisplayOrder, type ContestantMedia } from './contestantMediaRepository.js';
import { MAX_IMAGES_PER_CONTESTANT, uploadContestantImage } from './imageUploadService.js';
import type { ObjectStorage } from './storage.js';

/** A contestant's own media is always editable by the War's creator, in any status (§6.1, §6.2). */
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

export interface AddImageInput {
  warId: string;
  contestantId: string;
  caller: Caller;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

export type AddImageOutcome = MutationOutcome<ContestantMedia>;

export async function addContestantImage(db: Kysely<Database>, storage: ObjectStorage, input: AddImageInput): Promise<AddImageOutcome> {
  const guard = await guardOwnedContestant(db, input.warId, input.contestantId, input.caller);
  if (guard.kind !== 'ok') return guard;

  const outcome = await uploadContestantImage(db, storage, {
    contestantId: input.contestantId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    originalExt: input.originalExt,
  });

  if (outcome.kind === 'tooManyImages') {
    return { kind: 'validationError', errors: [`a contestant may hold at most ${MAX_IMAGES_PER_CONTESTANT} images`] };
  }
  if (outcome.kind === 'invalidUpload') {
    return { kind: 'validationError', errors: ['invalid image upload'] };
  }
  await recordOwnerAction(db, guard, 'add_image');
  return outcome;
}

export async function reorderContestantMedia(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  mediaId: string,
  caller: Caller,
  displayOrder: number,
): Promise<MutationOutcome<void>> {
  const guard = await guardOwnedContestant(db, warId, contestantId, caller);
  if (guard.kind !== 'ok') return guard;

  const media = await findMediaById(db, mediaId);
  if (!media || media.contestantId !== contestantId) return { kind: 'notFound' };

  await setDisplayOrder(db, mediaId, displayOrder);
  await recordOwnerAction(db, guard, 'reorder_images');
  return { kind: 'ok', value: undefined };
}

/** Deletes the row, then (after it is gone) the image's stored variants and original, best effort. */
export async function removeContestantMedia(
  db: Kysely<Database>,
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  warId: string,
  contestantId: string,
  mediaId: string,
  caller: Caller,
): Promise<MutationOutcome<void>> {
  const guard = await guardOwnedContestant(db, warId, contestantId, caller);
  if (guard.kind !== 'ok') return guard;

  const media = await findMediaById(db, mediaId);
  if (!media || media.contestantId !== contestantId) return { kind: 'notFound' };

  await deleteMedia(db, mediaId);
  await deleteMediaObjects(storage, log, imageMediaPrefixes(contestantId, media.storageKey), { warId, contestantId, mediaId });
  await recordOwnerAction(db, guard, 'remove_image');
  return { kind: 'ok', value: undefined };
}
