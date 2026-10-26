# 10 — Cover the untested paths

## Summary
Add tests for three paths nothing covers today.

## Acceptance criteria
- A test for a storage failure during upload cleanup: `cleanUpUnlessSaved` in
  `war-api/src/wars/warMediaStorage.ts` when `deletePrefix` throws after a failed save (logged,
  original error or outcome preserved). Would live in `war-api/test/unit/` with a storage
  double, or as a scenario with steps in `war-api/test/features/` (e.g. `share-image.steps.ts`).
- A test for a contestant removed from its War mid image upload
  (`war-api/src/contestants/mediaService.ts`, `imageUploadService.ts`). Would live in
  `war-api/test/integration/` or alongside `war-api/test/features/image-processing.steps.ts`.
- A test for a long bio on a phone when neither contestant has media (UI vote mode). A scenario
  in `war-ui-default/features/vote-mode-responsive.feature` with steps in
  `war-ui-default/tests/acceptance/steps/vote-mode-responsive.steps.ts` (shared bio steps in
  `shared-bio.steps.ts`).

## Technical notes
- Follow AGENTS.md: test first, with `// Arrange`, `// Act` and `// Assert` comments.
