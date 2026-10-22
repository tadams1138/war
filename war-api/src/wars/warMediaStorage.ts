import type { FastifyBaseLogger } from 'fastify';
import type { ObjectStorage } from '../contestants/storage.js';
import type { MutationOutcome } from '../shared/outcomes.js';

/** Storage prefixes holding these contestants' media (key layout: `imageUploadService.ts`). */
export function contestantMediaPrefixes(contestantIds: string[]): string[] {
  return contestantIds.flatMap((id) => [`contestants/${id}/`, `originals/${id}/`]);
}

/**
 * Prefixes of one image's objects: its variants (`<storageKey>-<width>.webp`) and its original
 * (`originals/<contestantId>/<imageId>.<ext>`, the image id being the last segment of `storageKey`).
 * Prefixes rather than exact keys, so a row that never recorded its extension still reclaims the original.
 * A row without a storage key owns no objects.
 */
export function imageMediaPrefixes(contestantId: string, storageKey: string | null): string[] {
  if (storageKey === null) return [];
  const imageId = storageKey.slice(storageKey.lastIndexOf('/') + 1);
  return [`${storageKey}-`, `originals/${contestantId}/${imageId}.`];
}

/**
 * Share image keys: every upload is new, `share-images/<warId>-<uploadId>.jpg` (public) with its original at
 * `originals/share-images/<warId>-<uploadId>.<ext>` (private), so a replaced image can be kept until its successor is saved.
 * Images stored before that scheme sit at `share-images/<warId>.jpg`; both shapes are recognised.
 */
export function shareImageKeys(warId: string, uploadId: string, originalExt: string): { publicKey: string; originalKey: string } {
  return { publicKey: `share-images/${warId}-${uploadId}.jpg`, originalKey: `originals/share-images/${warId}-${uploadId}.${originalExt}` };
}

/** Prefixes of one share image's objects (public variant and private original), derived from the public key; none without a key. */
export function shareImageMediaPrefixes(publicKey: string | null): string[] {
  if (publicKey === null) return [];
  const stem = publicKey.slice('share-images/'.length, publicKey.lastIndexOf('.'));
  return [`share-images/${stem}.`, `originals/share-images/${stem}.`];
}

/** Every storage prefix holding this War's media (key layout: `imageUploadService.ts`, `shareImageKeys`). */
export function mediaPrefixes(warId: string, contestantIds: string[]): string[] {
  return [
    ...contestantMediaPrefixes(contestantIds),
    `share-images/${warId}-`,
    `originals/share-images/${warId}-`,
    `share-images/${warId}.`,
    `originals/share-images/${warId}.`,
  ];
}

/**
 * Runs the owner action that persists objects already uploaded under `uploadedPrefixes`. If it throws or is refused,
 * nothing references those objects, so they are deleted (best effort) before the error or outcome is passed on unchanged.
 */
export async function cleanUpUnlessSaved<T>(
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  uploadedPrefixes: string[],
  logContext: Record<string, unknown>,
  action: () => Promise<MutationOutcome<T>>,
): Promise<MutationOutcome<T>> {
  let outcome: MutationOutcome<T>;
  try {
    outcome = await action();
  } catch (err) {
    await deleteMediaObjects(storage, log, uploadedPrefixes, logContext);
    throw err;
  }
  if (outcome.kind !== 'ok') await deleteMediaObjects(storage, log, uploadedPrefixes, logContext);
  return outcome;
}

/**
 * Best effort: the database rows are already gone (removed War, deleted
 * War, contestant or image, or banned Voter), so a storage failure is logged
 * (leaving orphaned objects) rather than failing the request. Stops at the
 * first failing prefix.
 */
export async function deleteMediaObjects(
  storage: ObjectStorage,
  log: FastifyBaseLogger,
  prefixes: string[],
  logContext: Record<string, unknown>,
): Promise<void> {
  try {
    for (const prefix of prefixes) {
      await storage.deletePrefix(prefix);
    }
  } catch (err) {
    log.error({ err, ...logContext }, 'failed to delete deleted media objects from storage');
  }
}
