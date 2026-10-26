# 9 — Clean up orphaned storage objects

## Summary
Storage cleanup after a delete, Remove or Ban is best effort: a storage failure is logged and
leaves orphaned objects; the request still succeeds.

## Technical notes
- Code: `deleteMediaObjects` in `war-api/src/wars/warMediaStorage.ts` catches the failure, logs
  `failed to delete deleted media objects from storage`, and stops at the first failing prefix.
  Callers: `war-api/src/contestants/contestantsService.ts` (delete contestant),
  `war-api/src/contestants/mediaService.ts` (remove image), `war-api/src/wars/removeWarService.ts`
  (Remove War), `war-api/src/wars/warsService.ts` (delete War) and
  `war-api/src/voterModeration/voterModerationService.ts` (Ban). `cleanUpUnlessSaved` in the same
  file uses it for failed saves.
- Candidate approaches: a scheduled sweep (the nightly Cron Worker
  `war-infra/edge/scheduled-tasks.js` could call a new internal task alongside
  `close-expired-wars`) that lists storage prefixes and deletes those no row references; or a
  persisted deletion queue written in the same transaction as the row delete and drained with
  retries. Storage interface: `war-api/src/contestants/storage.ts`.

## Open questions
- Sweep versus queue; how a sweep avoids deleting objects uploaded but not yet saved
  (in-flight uploads).
