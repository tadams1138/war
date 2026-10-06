import type { FastifyBaseLogger } from 'fastify';
import type { ObjectStorage } from '../contestants/storage.js';

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

/** Every storage prefix holding this War's media (key layout: `imageUploadService.ts`, `setShareImage` in `warsService.ts`). */
export function mediaPrefixes(warId: string, contestantIds: string[]): string[] {
  return [...contestantMediaPrefixes(contestantIds), `share-images/${warId}.`, `originals/share-images/${warId}.`];
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
