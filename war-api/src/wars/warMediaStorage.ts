import type { FastifyBaseLogger } from 'fastify';
import type { ObjectStorage } from '../contestants/storage.js';

/** Every storage prefix holding this War's media (key layout: `imageUploadService.ts`, `setShareImage` in `warsService.ts`). */
export function mediaPrefixes(warId: string, contestantIds: string[]): string[] {
  return [
    ...contestantIds.flatMap((id) => [`contestants/${id}/`, `originals/${id}/`]),
    `share-images/${warId}.`,
    `originals/share-images/${warId}.`,
  ];
}

/**
 * Best effort: the database rows are already gone (removed War or banned
 * Voter), so a storage failure is logged (leaving orphaned objects) rather
 * than failing the request. Stops at the first failing prefix.
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
    log.error({ err, ...logContext }, "failed to delete a deleted War's media objects from storage");
  }
}
