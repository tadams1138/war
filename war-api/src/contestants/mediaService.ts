import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { loadOwnedWar } from '../wars/warAccess.js';
import { deleteMediaObjects, imageMediaPrefixes } from '../wars/warMediaStorage.js';
import type { Forbidden, MutationOutcome, NotFound } from '../shared/outcomes.js';
import { findContestantById } from './contestantsRepository.js';
import { deleteMedia, findMediaById, setDisplayOrder, type ContestantMedia } from './contestantMediaRepository.js';
import { MAX_IMAGES_PER_CONTESTANT, uploadContestantImage } from './imageUploadService.js';
import type { ObjectStorage } from './storage.js';

/** A contestant's own media is always editable by the War's creator, in any status (§6.1, §6.2). */
async function guardOwnedContestant(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  voterId: string,
): Promise<{ kind: 'ok' } | NotFound | Forbidden> {
  const warGuard = await loadOwnedWar(db, warId, voterId);
  if (warGuard.kind !== 'ok') return warGuard;

  const contestant = await findContestantById(db, contestantId);
  if (!contestant || contestant.warId !== warId) return { kind: 'notFound' };

  return { kind: 'ok' };
}

export interface AddImageInput {
  warId: string;
  contestantId: string;
  voterId: string;
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

export type AddImageOutcome = MutationOutcome<ContestantMedia>;

export async function addContestantImage(db: Kysely<Database>, storage: ObjectStorage, input: AddImageInput): Promise<AddImageOutcome> {
  const guard = await guardOwnedContestant(db, input.warId, input.contestantId, input.voterId);
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
  return outcome;
}

export async function reorderContestantMedia(
  db: Kysely<Database>,
  warId: string,
  contestantId: string,
  mediaId: string,
  voterId: string,
  displayOrder: number,
): Promise<MutationOutcome<void>> {
  const guard = await guardOwnedContestant(db, warId, contestantId, voterId);
  if (guard.kind !== 'ok') return guard;

  const media = await findMediaById(db, mediaId);
  if (!media || media.contestantId !== contestantId) return { kind: 'notFound' };

  await setDisplayOrder(db, mediaId, displayOrder);
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
  voterId: string,
): Promise<MutationOutcome<void>> {
  const guard = await guardOwnedContestant(db, warId, contestantId, voterId);
  if (guard.kind !== 'ok') return guard;

  const media = await findMediaById(db, mediaId);
  if (!media || media.contestantId !== contestantId) return { kind: 'notFound' };

  await deleteMedia(db, mediaId);
  await deleteMediaObjects(storage, log, imageMediaPrefixes(contestantId, media.storageKey), { warId, contestantId, mediaId });
  return { kind: 'ok', value: undefined };
}
